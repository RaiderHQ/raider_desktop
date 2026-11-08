import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, rename, lstat } from 'fs/promises'
import { execFileSync } from 'child_process'
import { tmpdir } from 'os'
import { basename, join } from 'path'

const mockSafeExec = vi.hoisted(() => vi.fn())
const trashed = vi.hoisted(() => ({ dir: '', paths: [] as string[] }))
const trashItem = vi.hoisted(() => vi.fn())
// Files deleted for real: these handlers must only ever use the Trash
const deletions = vi.hoisted(() => [] as string[])
const deleteTrace = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({
  BrowserWindow: class {},
  app: { getPath: (): string => '/' },
  shell: { trashItem }
}))
vi.mock('../../../src/main/utils/safeExec', () => ({ safeExec: mockSafeExec }))
vi.mock('../../../src/main/handlers/trace/deleteTrace', () => ({ default: deleteTrace }))
// Every way to delete a file records its path, then deletes for real
const spied = vi.hoisted(
  () =>
    <T extends Record<string, unknown>>(actual: T, names: string[]): T => {
      const out: Record<string, unknown> = { ...actual }
      for (const name of names) {
        const fn = actual[name] as ((...args: unknown[]) => unknown) | undefined
        if (!fn) continue
        out[name] = (...args: unknown[]): unknown => {
          deletions.push(String(args[0]))
          return fn(...args)
        }
      }
      return out as T
    }
)
vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>()
  const wrapped = spied(actual as never, ['unlink', 'rm', 'rmdir'])
  return { ...(wrapped as object), default: wrapped }
})
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  const names = ['unlink', 'unlinkSync', 'rm', 'rmSync', 'rmdir', 'rmdirSync']
  const wrapped = spied(actual as never, names) as Record<string, unknown>
  wrapped.promises = spied(actual.promises as never, ['unlink', 'rm', 'rmdir'])
  return { ...wrapped, default: wrapped }
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
  deleteTrace.mockReset()
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
  // Checked for every test, paste included, before the clean-up below deletes anything
  expect(projectDeletions()).toEqual([])
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

  it('refuses a file over the size cap, but reads one exactly at it', async () => {
    await writeFile(join(project, 'spec/big_spec.rb'), 'x'.repeat(MAX_TEST_FILE_BYTES + 1))
    expect(await readTestFile(project, 'spec/big_spec.rb')).toMatchObject({ success: false })
    await writeFile(join(project, 'spec/max_spec.rb'), 'x'.repeat(MAX_TEST_FILE_BYTES))
    expect(await readTestFile(project, 'spec/max_spec.rb')).toMatchObject({ success: true })
  })

  it('refuses a symlink even when it points inside the project', async () => {
    await writeFile(join(project, 'spec/api_spec.rb'), CODE)
    await symlink(join(project, 'spec/api_spec.rb'), join(project, 'spec/link_spec.rb'))
    expect(await readTestFile(project, 'spec/link_spec.rb')).toMatchObject({ success: false })
  })

  it('refuses a FIFO without blocking', async () => {
    try {
      execFileSync('mkfifo', [join(project, 'spec/f_spec.rb')])
    } catch {
      return
    }
    expect(await readTestFile(project, 'spec/f_spec.rb')).toMatchObject({ success: false })
  })

  it("reads only under the spec folder, or a recorded test's own file", async () => {
    await mkdir(join(project, 'lib'))
    await writeFile(join(project, 'lib/x_spec.rb'), CODE)
    expect(await readTestFile(project, 'lib/x_spec.rb')).toMatchObject({ success: false })
    // A recorded test kept its file when spec_path moved: its record vouches for it
    const saved = await saveRecordedTest(project, appState.layout!, rec('r9', 'Old place'), {})
    await mkdir(join(project, 'old'))
    await mkdir(join(project, '.raider/tests/old'), { recursive: true })
    await rename(join(project, saved.file), join(project, 'old/old_place_spec.rb'))
    const sidecar = JSON.parse(
      await readFile(join(project, '.raider/tests', `${saved.file}.json`), 'utf-8')
    )
    await writeFile(
      join(project, '.raider/tests/old/old_place_spec.rb.json'),
      JSON.stringify({ ...sidecar, file: 'old/old_place_spec.rb' })
    )
    expect(await readTestFile(project, 'old/old_place_spec.rb')).toMatchObject({ success: true })
  })
})

describe('pasteTestFile', () => {
  it('writes a new <base>_copy_spec.rb next to the selected file, then _copy_2', async () => {
    await mkdir(join(project, 'spec/api'))
    await writeFile(join(project, 'spec/api/health_spec.rb'), CODE)
    const near = 'spec/api/health_spec.rb'
    const first = await pasteTestFile(project, { text: CODE, sourceFile: near, nearFile: near })
    expect(first).toMatchObject({ success: true, file: 'spec/api/health_copy_spec.rb' })
    const second = await pasteTestFile(project, { text: CODE, sourceFile: near, nearFile: near })
    expect(second).toMatchObject({ success: true, file: 'spec/api/health_copy_2_spec.rb' })
    expect(await readFile(join(project, 'spec/api/health_copy_2_spec.rb'), 'utf-8')).toBe(CODE)
  })

  it('never overwrites: an existing name (or a stale record for it) is skipped', async () => {
    await writeFile(join(project, 'spec/a_copy_spec.rb'), 'mine')
    await mkdir(join(project, '.raider/tests/spec'), { recursive: true })
    await writeFile(join(project, '.raider/tests/spec/a_copy_2_spec.rb.json'), '{}')
    const result = await pasteTestFile(project, { text: CODE, sourceFile: 'spec/a_spec.rb' })
    expect(result).toMatchObject({ success: true, file: 'spec/a_copy_3_spec.rb' })
    expect(await readFile(join(project, 'spec/a_copy_spec.rb'), 'utf-8')).toBe('mine')
  })

  it("uses the copied file's folder when it exists here, else the spec root", async () => {
    await mkdir(join(project, 'spec/ui'))
    expect(
      await pasteTestFile(project, { text: CODE, sourceFile: 'spec/ui/x_spec.rb' })
    ).toMatchObject({
      success: true,
      file: 'spec/ui/x_copy_spec.rb'
    })
    expect(
      await pasteTestFile(project, { text: CODE, sourceFile: 'spec/nowhere/y_spec.rb' })
    ).toMatchObject({ success: true, file: 'spec/y_copy_spec.rb' })
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

  it('renames the first top-level describe string to the given name', async () => {
    const result = await pasteTestFile(project, {
      text: CODE,
      sourceFile: 'spec/api_spec.rb',
      name: 'API copy'
    })
    expect(result).toEqual({ success: true, file: 'spec/api_copy_spec.rb', renamed: true })
    expect(await readFile(join(project, 'spec/api_copy_spec.rb'), 'utf-8')).toBe(
      CODE.replace("describe 'API'", "describe 'API copy'")
    )
    const dq = 'require "x"\nRSpec.describe("Cart", :smoke) do\n  describe "inner" do\n  end\nend\n'
    await pasteTestFile(project, { text: dq, sourceFile: 'spec/cart_spec.rb', name: 'Cart copy' })
    expect(await readFile(join(project, 'spec/cart_copy_spec.rb'), 'utf-8')).toBe(
      dq.replace('"Cart"', '"Cart copy"')
    )
  })

  it('leaves the describe alone when it is not a simple string or the name does not fit', async () => {
    const cases: [string, string][] = [
      ['describe "Cart #{x}" do\nend\n', 'Cart copy'],
      ["describe 'It\\'s' do\nend\n", "It's copy"],
      ['describe Cart do\nend\n', 'Cart copy'],
      ["describe 'A' do\nend\n", "A's copy"],
      ['describe "A" do\nend\n', 'A #{evil} copy'],
      ["describe 'A' do\nend\n", 'A\ncopy'],
      ["  describe 'Nested only' do\n  end\n", 'Nested only copy']
    ]
    for (const [text, name] of cases) {
      const result = await pasteTestFile(project, { text, sourceFile: 'spec/c_spec.rb', name })
      expect(result).toMatchObject({ success: true, renamed: false })
      const file = (result as { file: string }).file
      expect(await readFile(join(project, file), 'utf-8')).toBe(text)
    }
  })

  it('a rename that would pass the size cap is refused', async () => {
    const text = "describe 'A' do\nend\n" + '#'.repeat(MAX_TEST_FILE_BYTES - 20)
    expect(Buffer.byteLength(text)).toBe(MAX_TEST_FILE_BYTES)
    expect(
      await pasteTestFile(project, { text, sourceFile: 'spec/a_spec.rb', name: 'A copy' })
    ).toMatchObject({ success: false })
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
    // Like delete-test, the recorded test's trace goes with it
    expect(deleteTrace).toHaveBeenCalledWith('r1')
  })

  it('never hands a record id that is not a plain name to deleteTrace', async () => {
    const saved = await saveRecordedTest(project, appState.layout!, rec('..', 'Dots'))
    expect(await trashTest(project, saved.file)).toEqual({ success: true, testId: '..' })
    expect(trashed.paths).toHaveLength(2)
    expect(deleteTrace).not.toHaveBeenCalled()
  })

  it("a code file's trash deletes no trace", async () => {
    await writeFile(join(project, 'spec/api_spec.rb'), CODE)
    await trashTest(project, 'spec/api_spec.rb')
    expect(deleteTrace).not.toHaveBeenCalled()
  })

  it('refuses a file in a folder that is a symlink out of the project', async () => {
    await writeFile(join(outside, 'x_spec.rb'), 'x')
    await symlink(outside, join(project, 'spec/out'))
    expect(await trashTest(project, 'spec/out/x_spec.rb')).toMatchObject({ success: false })
    expect(trashItem).not.toHaveBeenCalled()
    expect(await exists(join(outside, 'x_spec.rb'))).toBe(true)
  })

  it('refuses a spec that is a symlink, even to a file inside the project', async () => {
    await writeFile(join(project, 'spec/api_spec.rb'), CODE)
    await symlink(join(project, 'spec/api_spec.rb'), join(project, 'spec/link_spec.rb'))
    expect(await trashTest(project, 'spec/link_spec.rb')).toMatchObject({ success: false })
    expect(trashItem).not.toHaveBeenCalled()
  })

  it('refuses a spec file outside the spec folder unless a record vouches for it', async () => {
    await mkdir(join(project, 'lib'))
    await writeFile(join(project, 'lib/x_spec.rb'), CODE)
    expect(await trashTest(project, 'lib/x_spec.rb')).toMatchObject({ success: false })
    expect(trashItem).not.toHaveBeenCalled()
  })

  it('a recorded file whose record is gone is trashed as a plain file', async () => {
    const saved = await saveRecordedTest(project, appState.layout!, rec('r3', 'No record'))
    await rename(join(project, '.raider/tests', `${saved.file}.json`), join(outside, 'r.json'))
    expect(await trashTest(project, saved.file)).toEqual({ success: true })
    expect(trashed.paths).toEqual([join(project, saved.file)])
  })

  it('checks the record before trashing anything: a bad record leaves both', async () => {
    const saved = await saveRecordedTest(project, appState.layout!, rec('r4', 'Bad record'))
    const record = join(project, '.raider/tests', `${saved.file}.json`)
    await rename(record, join(outside, 'r.json'))
    await symlink(join(outside, 'r.json'), record)
    expect(await trashTest(project, saved.file)).toMatchObject({ success: false })
    expect(trashItem).not.toHaveBeenCalled()
    expect(await exists(join(project, saved.file))).toBe(true)
  })

  it('a folder swapped for a link after the check is refused; the gone spec is still pruned, with a warning', async () => {
    const saved = await saveRecordedTest(project, appState.layout!, rec('r5', 'Swap'))
    appState.tests.set('r5', { ...rec('r5', 'Swap'), file: saved.file, ownership: 'recorded' })
    const recordDir = join(project, '.raider/tests/spec')
    trashItem.mockImplementationOnce(async (p: string) => {
      trashed.paths.push(p)
      await rename(p, join(trashed.dir, 'spec'))
      // Between the spec's trash and the record's: the record's folder now leads outside
      await mkdir(join(outside, 'decoy'))
      await rename(
        join(recordDir, `${basename(saved.file)}.json`),
        join(outside, 'decoy', `${basename(saved.file)}.json`)
      )
      await rm(recordDir, { recursive: true })
      await symlink(join(outside, 'decoy'), recordDir)
    })
    deletions.length = 0
    expect(await trashTest(project, saved.file)).toEqual({
      success: true,
      testId: 'r5',
      recordLeft: true
    })
    // Only the stand-in's own removal of the record folder; the handler deleted nothing
    expect(deletions.filter((p) => p.startsWith(project) && !p.endsWith('.tmp'))).toEqual([
      recordDir
    ])
    deletions.length = 0
    expect(trashed.paths).toEqual([join(project, saved.file)])
    expect(await exists(join(outside, 'decoy', `${basename(saved.file)}.json`))).toBe(true)
    expect(appState.tests.has('r5')).toBe(false)
    expect(deleteTrace).toHaveBeenCalledWith('r5')
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
