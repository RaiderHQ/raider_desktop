import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

const mockSafeExec = vi.hoisted(() => vi.fn())
vi.mock('electron', () => ({ BrowserWindow: class {}, app: { getPath: (): string => '/' } }))
vi.mock('../../../src/main/utils/safeExec', () => ({ safeExec: mockSafeExec }))

import setActiveProject from '../../../src/main/handlers/project/setActiveProject'
import { appState } from '../../../src/main/handlers/appState'
import { saveRecordedTest } from '../../../src/main/handlers/tests/recordedTests'
import { readSidecar } from '../../../src/main/handlers/tests/sidecar'
import { listProjectTestsHandler } from '../../../src/main/handlers/tests/projectTestIpc'
import { setTestTags } from '../../../src/main/handlers/tests/setTestTags'
import { hashRuby } from '../../../src/main/handlers/tests/codeHash'
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
const read = (rel: string): Promise<string> => readFile(join(project, rel), 'utf-8')

beforeEach(async () => {
  project = await mkdtemp(join(tmpdir(), 'raider-tags-'))
  outside = await mkdtemp(join(tmpdir(), 'raider-tags-out-'))
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
  await rm(project, { recursive: true, force: true })
  await rm(outside, { recursive: true, force: true })
})

describe('setTestTags', () => {
  it('rewrites the spec and the sidecar of a recorded test', async () => {
    const s = await saveRecordedTest(project, appState.layout!, rec('a', 'Alpha'))
    const result = await setTestTags(s.file, [' Smoke ', 'api', 'SMOKE'])
    expect(result).toEqual({ success: true })
    const text = await read(s.file)
    expect(text).toContain("describe 'Alpha', :api, :smoke do")
    const after = await readSidecar(project, s.file)
    expect(after?.tags).toEqual(['api', 'smoke'])
    expect(after?.hash).toBe(hashRuby(text))
    expect(after?.updatedAt >= s.updatedAt).toBe(true)
    expect(send).toHaveBeenCalledWith('suite-updated', expect.anything())
    const entry = (await listProjectTestsHandler()).find((e) => e.file === s.file)
    expect(entry).toMatchObject({ ownership: 'recorded', tags: ['api', 'smoke'] })
    // clearing removes them again
    expect(await setTestTags(s.file, [])).toEqual({ success: true })
    expect(await read(s.file)).toContain("describe 'Alpha' do")
    expect((await readSidecar(project, s.file))?.tags).toBeUndefined()
  })

  it('writes only the sidecar of a code-owned test', async () => {
    const s = await saveRecordedTest(project, appState.layout!, rec('b', 'Bravo'))
    const edited = (await read(s.file)) + '\nputs 1\n'
    await writeFile(join(project, s.file), edited)
    expect(await setTestTags(s.file, ['smoke'])).toEqual({ success: true })
    expect(await read(s.file)).toBe(edited)
    const after = await readSidecar(project, s.file)
    expect(after?.tags).toEqual(['smoke'])
    expect(after?.codeOwned).toBe(true)
    expect(after?.hash).toBe(s.hash)
  })

  it('rewrites only the first describe line of a file with no sidecar', async () => {
    const body =
      "RSpec.describe 'Hand', :old, type: :feature do\n  it 'x' do\n  end\n\n  describe 'inner', :keep do\n  end\nend\n"
    await writeFile(join(project, 'spec/hand_spec.rb'), body)
    expect(await setTestTags('spec/hand_spec.rb', ['b', 'a'])).toEqual({
      success: true,
      fileOnly: true
    })
    expect(await read('spec/hand_spec.rb')).toBe(
      body.replace(':old, type: :feature', ':a, :b, type: :feature')
    )
  })

  it('refuses unsafe paths, bad input and files that are not specs', async () => {
    await writeFile(join(outside, 'x_spec.rb'), "describe 'X' do\nend\n")
    await symlink(join(outside, 'x_spec.rb'), join(project, 'spec/link_spec.rb'))
    for (const file of [
      '../x_spec.rb',
      '/etc/passwd_spec.rb',
      'spec/../../x_spec.rb',
      'spec\\a_spec.rb',
      'spec/a.rb',
      '',
      7,
      null,
      undefined,
      'spec/link_spec.rb'
    ]) {
      const r = await setTestTags(file, ['a'])
      expect(r.success, String(file)).toBe(false)
    }
    expect(await readFile(join(outside, 'x_spec.rb'), 'utf-8')).toBe("describe 'X' do\nend\n")
    expect(send).not.toHaveBeenCalled()
  })

  it('refuses non-array tags, too many tags and a missing file, without throwing', async () => {
    await writeFile(join(project, 'spec/a_spec.rb'), "describe 'A' do\nend\n")
    expect((await setTestTags('spec/a_spec.rb', 'smoke')).success).toBe(false)
    const many = Array.from({ length: 21 }, (_, i) => `t${i}`)
    expect((await setTestTags('spec/a_spec.rb', many)).success).toBe(false)
    expect((await setTestTags('spec/nope_spec.rb', ['a'])).success).toBe(false)
    expect(await read('spec/a_spec.rb')).toBe("describe 'A' do\nend\n")
  })

  it('drops invalid tags', async () => {
    await writeFile(join(project, 'spec/a_spec.rb'), "describe 'A' do\nend\n")
    await setTestTags('spec/a_spec.rb', ['ok', "x'y", 'a b', 3, '1a', '', 'Fine_2'])
    expect(await read('spec/a_spec.rb')).toBe("describe 'A', :fine_2, :ok do\nend\n")
  })

  it('fails without a project', async () => {
    await setActiveProject(null)
    expect((await setTestTags('spec/a_spec.rb', ['a'])).success).toBe(false)
  })
})
