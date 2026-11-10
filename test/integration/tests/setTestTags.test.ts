import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, chmod, stat, unlink } from 'fs/promises'
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
    expect(send).toHaveBeenCalledWith('tests-updated', expect.anything())
    const entry = (await listProjectTestsHandler()).find((e) => e.file === s.file)
    expect(entry).toMatchObject({ ownership: 'recorded', tags: ['api', 'smoke'] })
    // clearing removes them again
    expect(await setTestTags(s.file, [])).toEqual({ success: true })
    expect(await read(s.file)).toContain("describe 'Alpha' do")
    expect((await readSidecar(project, s.file))?.tags).toBeUndefined()
  })

  it('rewrites the describe line of a code-owned test and mirrors the sidecar', async () => {
    const s = await saveRecordedTest(project, appState.layout!, rec('b', 'Bravo'))
    const edited = (await read(s.file)) + '\nputs 1\n'
    await writeFile(join(project, s.file), edited)
    expect(await setTestTags(s.file, ['smoke'])).toEqual({ success: true })
    expect(await read(s.file)).toBe(
      edited.replace("describe 'Bravo' do", "describe 'Bravo', :smoke do")
    )
    const after = await readSidecar(project, s.file)
    expect(after?.tags).toEqual(['smoke'])
    expect(after?.codeOwned).toBe(true)
    expect(after?.hash).toBe(s.hash)
    const entry = (await listProjectTestsHandler()).find((e) => e.file === s.file)
    expect(entry?.tags).toEqual(['smoke'])
  })

  it('writes nothing for a code-owned test whose describe line cannot be changed', async () => {
    const s = await saveRecordedTest(project, appState.layout!, rec('b', 'Bravo'))
    const edited =
      (await read(s.file)).replace(
        "describe 'Bravo' do",
        "describe 'Bravo',\n  type: :feature do"
      ) + '\nputs 1\n'
    await writeFile(join(project, s.file), edited)
    const before = await readSidecar(project, s.file)
    expect(await setTestTags(s.file, ['smoke'])).toEqual({
      success: false,
      error: "This test's describe line could not be changed; edit it in the file."
    })
    expect(await read(s.file)).toBe(edited)
    expect(await readSidecar(project, s.file)).toEqual(before)
  })

  it('does not re-create a missing spec of a recorded test', async () => {
    const s = await saveRecordedTest(project, appState.layout!, rec('a', 'Alpha'))
    await unlink(join(project, s.file))
    expect(await setTestTags(s.file, ['smoke'])).toEqual({
      success: false,
      error: 'This test could not be found.'
    })
    await expect(stat(join(project, s.file))).rejects.toThrow()
    expect((await readSidecar(project, s.file))?.tags).toBeUndefined()
  })

  it('only tags specs under the spec folder, with fixed errors', async () => {
    await mkdir(join(project, 'other'))
    await writeFile(join(project, 'other/a_spec.rb'), "describe 'A' do\nend\n")
    await writeFile(join(project, 'top_spec.rb'), "describe 'A' do\nend\n")
    expect(await setTestTags('other/a_spec.rb', ['a'])).toEqual({
      success: false,
      error: 'This test could not be found.'
    })
    expect((await setTestTags('top_spec.rb', ['a'])).success).toBe(false)
    expect(await read('other/a_spec.rb')).toBe("describe 'A' do\nend\n")
    const r = await setTestTags('spec/missing_spec.rb', ['a'])
    expect(r).toEqual({ success: false, error: 'This test could not be found.' })
  })

  it('keeps the file mode', async () => {
    await writeFile(join(project, 'spec/m_spec.rb'), "describe 'M' do\nend\n")
    await chmod(join(project, 'spec/m_spec.rb'), 0o750)
    await setTestTags('spec/m_spec.rb', ['a'])
    expect((await stat(join(project, 'spec/m_spec.rb'))).mode & 0o777).toBe(0o750)
    const s = await saveRecordedTest(project, appState.layout!, rec('a', 'Alpha'))
    await chmod(join(project, s.file), 0o750)
    await setTestTags(s.file, ['a'])
    expect((await stat(join(project, s.file))).mode & 0o777).toBe(0o750)
  })

  it('never replaces a symlinked spec of a recorded test', async () => {
    const s = await saveRecordedTest(project, appState.layout!, rec('a', 'Alpha'))
    const original = await read(s.file)
    await writeFile(join(outside, 'real.rb'), original)
    await unlink(join(project, s.file))
    await symlink(join(outside, 'real.rb'), join(project, s.file))
    expect((await setTestTags(s.file, ['x'])).success).toBe(false)
    expect(await readFile(join(outside, 'real.rb'), 'utf-8')).toBe(original)
  })

  it('runs concurrent calls one after the other', async () => {
    await writeFile(join(project, 'spec/c_spec.rb'), "describe 'C' do\nend\n")
    await Promise.all([
      setTestTags('spec/c_spec.rb', ['a']),
      setTestTags('spec/c_spec.rb', ['b']),
      setTestTags('spec/c_spec.rb', ['c'])
    ])
    expect(await read('spec/c_spec.rb')).toBe("describe 'C', :c do\nend\n")
  })

  it('rewrites only the first describe line of a file with no sidecar', async () => {
    const body =
      "=begin\ndescribe 'no', :x do\n=end\nRSpec.describe 'Hand', :old, type: :feature do\n  it 'x' do\n  end\n\n  describe 'inner', :keep do\n  end\nend\n"
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
