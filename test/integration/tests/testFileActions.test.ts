import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, rename, lstat } from 'fs/promises'
import { tmpdir } from 'os'
import { basename, join } from 'path'

const mockSafeExec = vi.hoisted(() => vi.fn())
const trashed = vi.hoisted(() => ({ dir: '', paths: [] as string[] }))
const trashItem = vi.hoisted(() => vi.fn())
// Files deleted for real: these handlers must only ever use the Trash
const deletions = vi.hoisted(() => [] as string[])

vi.mock('electron', () => ({
  BrowserWindow: class {},
  app: { getPath: (): string => '/' },
  shell: { trashItem }
}))
vi.mock('../../../src/main/utils/safeExec', () => ({ safeExec: mockSafeExec }))
vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>()
  const unlink = (p: Parameters<typeof actual.unlink>[0]): Promise<void> => {
    deletions.push(String(p))
    return actual.unlink(p)
  }
  const rmFn = (
    p: Parameters<typeof actual.rm>[0],
    o?: Parameters<typeof actual.rm>[1]
  ): Promise<void> => {
    deletions.push(String(p))
    return actual.rm(p, o)
  }
  return { ...actual, unlink, rm: rmFn, default: { ...actual, unlink, rm: rmFn } }
})

import setActiveProject from '../../../src/main/handlers/project/setActiveProject'
import { appState } from '../../../src/main/handlers/appState'
import { saveRecordedTest } from '../../../src/main/handlers/tests/recordedTests'
import {
  MAX_TEST_FILE_BYTES,
  pasteTestFile,
  readTestFile,
  trashTest
} from '../../../src/main/handlers/tests/testFileActions'
import type { Test } from '../../../src/shared/types/test'

let project: string
let outside: string
const send = vi.fn()

const rec = (id: string, name: string): Test => ({
  id,
  name,
  url: 'https://x.test',
  steps: [{ id: 's1', kind: 'navigate', url: 'https://x.test/1' }]
})
const exists = (p: string): Promise<boolean> =>
  lstat(p).then(
    () => true,
    () => false
  )
const CODE = "describe 'API' do\n  it 'works' do\n    expect(1).to eq 1\n  end\nend\n"
// Deletions of the project's own spec or record files (tmp files of an atomic write are fine)
const projectDeletions = (): string[] =>
  deletions.filter((p) => p.startsWith(project) && !p.endsWith('.tmp'))

beforeEach(async () => {
  project = await mkdtemp(join(tmpdir(), 'raider-fileact-'))
  outside = await mkdtemp(join(tmpdir(), 'raider-fileact-out-'))
  trashed.dir = await mkdtemp(join(tmpdir(), 'raider-fileact-trash-'))
  trashed.paths = []
  deletions.length = 0
  trashItem.mockReset()
  trashItem.mockImplementation(async (p: string) => {
    trashed.paths.push(p)
    await rename(p, join(trashed.dir, `${trashed.paths.length}-${basename(p)}`))
  })
  await writeFile(join(project, 'Gemfile'), "gem 'rspec'\ngem 'selenium-webdriver'\n")
  await mkdir(join(project, 'spec'))
  mockSafeExec.mockReset()
  mockSafeExec.mockResolvedValue({ stdout: '{"examples":[]}', stderr: '', exitCode: 0 })
  send.mockReset()
  await setActiveProject(project)
  appState.mainWindow = { webContents: { send } } as never
})

afterEach(async () => {
  appState.mainWindow = null
  await setActiveProject(null)
  for (const dir of [project, outside, trashed.dir]) await rm(dir, { recursive: true, force: true })
})

describe('readTestFile', () => {
  it('reads a spec file of the open project', async () => {
    await writeFile(join(project, 'spec/api_spec.rb'), CODE)
    expect(await readTestFile(project, 'spec/api_spec.rb')).toEqual({ success: true, text: CODE })
  })

  it('refuses ../ traversal, absolute paths and non-spec files', async () => {
    await writeFile(join(outside, 'secret_spec.rb'), 'secret')
    await writeFile(join(project, 'spec/notes.rb'), 'notes')
    const rel = `../${basename(outside)}/secret_spec.rb`
    for (const bad of [rel, join(outside, 'secret_spec.rb'), 'spec/notes.rb', 'spec', 42, null]) {
      expect(await readTestFile(project, bad)).toMatchObject({ success: false })
    }
  })

  it('refuses a symlink in the project that points outside it', async () => {
    await writeFile(join(outside, 'secret_spec.rb'), 'secret')
    await symlink(join(outside, 'secret_spec.rb'), join(project, 'spec/l_spec.rb'))
    expect(await readTestFile(project, 'spec/l_spec.rb')).toMatchObject({ success: false })
  })

  it('refuses a projectPath other than the open project', async () => {
    await writeFile(join(project, 'spec/api_spec.rb'), CODE)
    expect(await readTestFile(outside, 'spec/api_spec.rb')).toMatchObject({ success: false })
    expect(await readTestFile(undefined, 'spec/api_spec.rb')).toMatchObject({ success: false })
  })

  it('refuses a file over the size cap', async () => {
    await writeFile(join(project, 'spec/big_spec.rb'), 'x'.repeat(MAX_TEST_FILE_BYTES + 1))
    expect(await readTestFile(project, 'spec/big_spec.rb')).toMatchObject({ success: false })
  })
})

describe('pasteTestFile', () => {
  it('writes a new <base>_copy_spec.rb next to the selected file, then _copy_2', async () => {
    await mkdir(join(project, 'spec/api'))
    await writeFile(join(project, 'spec/api/health_spec.rb'), CODE)
    const near = 'spec/api/health_spec.rb'
    const first = await pasteTestFile(project, { text: CODE, sourceFile: near, nearFile: near })
    expect(first).toEqual({ success: true, file: 'spec/api/health_copy_spec.rb' })
    const second = await pasteTestFile(project, { text: CODE, sourceFile: near, nearFile: near })
    expect(second).toEqual({ success: true, file: 'spec/api/health_copy_2_spec.rb' })
    expect(await readFile(join(project, 'spec/api/health_copy_2_spec.rb'), 'utf-8')).toBe(CODE)
  })

  it('never overwrites: an existing name (or a stale record for it) is skipped', async () => {
    await writeFile(join(project, 'spec/a_copy_spec.rb'), 'mine')
    await mkdir(join(project, '.raider/tests/spec'), { recursive: true })
    await writeFile(join(project, '.raider/tests/spec/a_copy_2_spec.rb.json'), '{}')
    const result = await pasteTestFile(project, { text: CODE, sourceFile: 'spec/a_spec.rb' })
    expect(result).toEqual({ success: true, file: 'spec/a_copy_3_spec.rb' })
    expect(await readFile(join(project, 'spec/a_copy_spec.rb'), 'utf-8')).toBe('mine')
  })

  it("uses the copied file's folder when it exists here, else the spec root", async () => {
    await mkdir(join(project, 'spec/ui'))
    expect(await pasteTestFile(project, { text: CODE, sourceFile: 'spec/ui/x_spec.rb' })).toEqual({
      success: true,
      file: 'spec/ui/x_copy_spec.rb'
    })
    expect(
      await pasteTestFile(project, { text: CODE, sourceFile: 'spec/nowhere/y_spec.rb' })
    ).toEqual({ success: true, file: 'spec/y_copy_spec.rb' })
  })

  it('falls back to the spec root for unsafe or outside folders', async () => {
    await mkdir(join(outside, 'spec'), { recursive: true })
    await symlink(outside, join(project, 'spec/out'))
    const cases = [
      { nearFile: '../evil_spec.rb', sourceFile: 'spec/evil_spec.rb' },
      { nearFile: `${outside}/evil_spec.rb`, sourceFile: 'spec/evil_spec.rb' },
      { nearFile: 'spec/out/evil_spec.rb', sourceFile: 'spec/out/evil_spec.rb' },
      { nearFile: 'lib/evil_spec.rb', sourceFile: 'lib/evil_spec.rb' }
    ]
    await mkdir(join(project, 'lib'))
    for (const c of cases) {
      const result = await pasteTestFile(project, { text: CODE, ...c })
      expect(result).toMatchObject({ success: true })
      expect((result as { file: string }).file).toMatch(/^spec\/evil_copy(_\d+)?_spec\.rb$/)
    }
    expect(await exists(join(outside, 'spec/evil_copy_spec.rb'))).toBe(false)
    expect(await exists(join(outside, 'evil_copy_spec.rb'))).toBe(false)
  })

  it('refuses text that is not a string or is too big, and a wrong project', async () => {
    const big = 'x'.repeat(MAX_TEST_FILE_BYTES + 1)
    for (const text of [42, null, undefined, { a: 1 }, big]) {
      expect(await pasteTestFile(project, { text, sourceFile: 'spec/a_spec.rb' })).toMatchObject({
        success: false
      })
    }
    expect(
      await pasteTestFile(outside, { text: CODE, sourceFile: 'spec/a_spec.rb' })
    ).toMatchObject({ success: false })
    expect(await pasteTestFile(project, null)).toMatchObject({ success: false })
  })

  it('refuses a source that is not a safe spec path', async () => {
    for (const sourceFile of ['spec/a.rb', '../a_spec.rb', `${outside}/a_spec.rb`, undefined]) {
      expect(await pasteTestFile(project, { text: CODE, sourceFile })).toMatchObject({
        success: false
      })
    }
  })
})

describe('trashTest', () => {
  it('moves a code file to the Trash, never deleting it', async () => {
    await writeFile(join(project, 'spec/api_spec.rb'), CODE)
    expect(await trashTest(project, 'spec/api_spec.rb')).toEqual({ success: true })
    expect(trashItem).toHaveBeenCalledWith(join(project, 'spec/api_spec.rb'))
    expect(await exists(join(project, 'spec/api_spec.rb'))).toBe(false)
    expect(projectDeletions()).toEqual([])
  })

  it('moves a recorded test and its record to the Trash and forgets it', async () => {
    const saved = await saveRecordedTest(project, appState.layout!, rec('r1', 'Login'))
    appState.tests.set('r1', { ...rec('r1', 'Login'), file: saved.file, ownership: 'recorded' })
    deletions.length = 0
    expect(await trashTest(project, saved.file)).toEqual({ success: true, testId: 'r1' })
    expect(trashed.paths).toEqual([
      join(project, saved.file),
      join(project, '.raider/tests', `${saved.file}.json`)
    ])
    expect(appState.tests.has('r1')).toBe(false)
    expect(send).toHaveBeenCalledWith('tests-updated', [])
    expect(projectDeletions()).toEqual([])
  })

  it('a recorded test whose file is missing still has its record trashed', async () => {
    const saved = await saveRecordedTest(project, appState.layout!, rec('r2', 'Gone'))
    await rename(join(project, saved.file), join(outside, 'moved_spec.rb'))
    expect(await trashTest(project, saved.file)).toEqual({ success: true, testId: 'r2' })
    expect(trashed.paths).toEqual([join(project, '.raider/tests', `${saved.file}.json`)])
  })

  it('refuses traversal, absolute paths, non-spec files and a wrong project', async () => {
    await writeFile(join(outside, 'x_spec.rb'), 'x')
    await writeFile(join(project, 'spec/notes.rb'), 'x')
    await writeFile(join(project, 'spec/a_spec.rb'), 'x')
    const bad = [`../${basename(outside)}/x_spec.rb`, join(outside, 'x_spec.rb'), 'spec/notes.rb']
    for (const rel of bad) expect(await trashTest(project, rel)).toMatchObject({ success: false })
    expect(await trashTest(outside, 'spec/a_spec.rb')).toMatchObject({ success: false })
    expect(await trashTest(project, 'spec/missing_spec.rb')).toMatchObject({ success: false })
    expect(trashItem).not.toHaveBeenCalled()
  })

  it('refuses a symlink pointing outside the project', async () => {
    await writeFile(join(outside, 'x_spec.rb'), 'x')
    await symlink(join(outside, 'x_spec.rb'), join(project, 'spec/l_spec.rb'))
    expect(await trashTest(project, 'spec/l_spec.rb')).toMatchObject({ success: false })
    expect(trashItem).not.toHaveBeenCalled()
    expect(await exists(join(outside, 'x_spec.rb'))).toBe(true)
  })

  it('a Trash failure is reported, with no fallback deletion', async () => {
    await writeFile(join(project, 'spec/api_spec.rb'), CODE)
    trashItem.mockRejectedValueOnce(new Error('no trash'))
    expect(await trashTest(project, 'spec/api_spec.rb')).toMatchObject({ success: false })
    expect(await exists(join(project, 'spec/api_spec.rb'))).toBe(true)
    expect(projectDeletions()).toEqual([])
  })
})
