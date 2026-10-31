import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

const mockSafeExec = vi.hoisted(() => vi.fn())
vi.mock('electron', () => ({ BrowserWindow: class {}, app: { getPath: (): string => '/' } }))
vi.mock('../../../src/main/utils/safeExec', () => ({ safeExec: mockSafeExec }))

import setActiveProject from '../../../src/main/handlers/project/setActiveProject'
import {
  getProjectLayoutHandler,
  listProjectTestsHandler,
  listedFiles,
  openCodeTestHandler,
  recordOverExampleHandler
} from '../../../src/main/handlers/tests/projectTestIpc'

let project: string
let outside: string

beforeEach(async () => {
  project = await mkdtemp(join(tmpdir(), 'raider-ipc-'))
  outside = await mkdtemp(join(tmpdir(), 'raider-ipc-out-'))
  await writeFile(join(project, 'Gemfile'), "gem 'rspec'\ngem 'selenium-webdriver'\n")
  await mkdir(join(project, 'spec'))
  await writeFile(
    join(project, 'spec', 'a_spec.rb'),
    "RSpec.describe 'A' do\n  it 'works' do\n    visit 'x'\n  end\nend\n"
  )
  await writeFile(join(outside, 'secret_spec.rb'), "it 'x' do\nend\n")
  await writeFile(join(project, 'other_spec.rb'), "it 'o' do\nend\n")
  await writeFile(join(project, 'helper.rb'), 'x = 1\n')
  await symlink(join(outside, 'secret_spec.rb'), join(project, 'spec', 'link_spec.rb'))
  mockSafeExec.mockReset()
  mockSafeExec.mockResolvedValue({ stdout: '{"examples":[]}', stderr: '', exitCode: 0 })
})

afterEach(async () => {
  await setActiveProject(null)
  await rm(project, { recursive: true, force: true })
  await rm(outside, { recursive: true, force: true })
})

describe('project test IPC', () => {
  it('lists nothing and has no layout without a project', async () => {
    await setActiveProject(null)
    expect(await listProjectTestsHandler()).toEqual([])
    expect(await getProjectLayoutHandler()).toBeNull()
  })

  it('lists spec files and exposes the layout', async () => {
    await setActiveProject(project)
    const entries = await listProjectTestsHandler()
    expect(entries.map((e) => e.file)).toContain('spec/a_spec.rb')
    expect((await getProjectLayoutHandler())?.specPath).toBeTruthy()
  })

  it('listedFiles accepts listed files and rejects the request if any is not listed', async () => {
    await setActiveProject(project)
    expect((await listedFiles(['spec/a_spec.rb'])).files).toEqual(['spec/a_spec.rb'])
    await expect(listedFiles(['spec/a_spec.rb', 'other_spec.rb'])).rejects.toThrow(
      'Not a project test: other_spec.rb'
    )
    await expect(listedFiles(['spec/a_spec.rb', 3])).rejects.toThrow('Not a spec file')
  })

  it('open-code-test opens a listed file', async () => {
    await setActiveProject(project)
    const view = await openCodeTestHandler('spec/a_spec.rb')
    expect(view.examples[0].name).toBe('works')
  })

  it('open-code-test rejects path outside spec', async () => {
    await setActiveProject(project)
    for (const bad of [
      '../' + outside.split('/').pop() + '/secret_spec.rb',
      '../../etc/passwd_spec.rb',
      join(outside, 'secret_spec.rb'),
      'helper.rb',
      'spec/../helper_spec.rb',
      'spec/link_spec.rb',
      'spec/missing_spec.rb'
    ]) {
      await expect(openCodeTestHandler(bad), bad).rejects.toThrow()
    }
  })

  it('open-code-test rejects a safe spec file the scanner does not list', async () => {
    await setActiveProject(project)
    expect((await listProjectTestsHandler()).map((e) => e.file)).not.toContain('other_spec.rb')
    await expect(openCodeTestHandler('other_spec.rb')).rejects.toThrow(/Not a project test/)
  })

  it('open-code-test refuses without a project', async () => {
    await setActiveProject(null)
    await expect(openCodeTestHandler('spec/a_spec.rb')).rejects.toThrow()
  })

  it('record-over-example replaces the example in a listed file', async () => {
    await setActiveProject(project)
    mockSafeExec.mockResolvedValue({
      stdout: '[{"startLine":2,"endLine":4}]',
      stderr: '',
      exitCode: 0
    })
    const steps = [{ id: 's', kind: 'navigate', url: 'https://x.test' }]
    expect(await recordOverExampleHandler('spec/a_spec.rb', 'works', steps, 'ruby')).toEqual({
      success: true
    })
    expect(await readFile(join(project, 'spec', 'a_spec.rb'), 'utf-8')).toBe(
      "RSpec.describe 'A' do\n  it 'works' do\n    driver.navigate.to('https://x.test')\n  end\nend\n"
    )
  })

  it('record-over-example reports a name that is not unique', async () => {
    await setActiveProject(project)
    mockSafeExec.mockResolvedValue({
      stdout: '[{"startLine":2,"endLine":4},{"startLine":5,"endLine":6}]',
      stderr: '',
      exitCode: 0
    })
    expect(await recordOverExampleHandler('spec/a_spec.rb', 'works', [], 'ruby')).toEqual({
      success: false,
      error: 'notUnique',
      count: 2
    })
  })

  it('record-over-example refuses unlisted files and bad steps, writing nothing', async () => {
    await setActiveProject(project)
    for (const bad of ['other_spec.rb', 'spec/link_spec.rb', '../x_spec.rb']) {
      const result = await recordOverExampleHandler(bad, 'works', [], 'ruby')
      expect(result.success, bad).toBe(false)
    }
    const result = await recordOverExampleHandler(
      'spec/a_spec.rb',
      'works',
      [{ kind: 'x' }],
      'ruby'
    )
    expect(result.success).toBe(false)
    expect(mockSafeExec).not.toHaveBeenCalled()
    expect(await readFile(join(outside, 'secret_spec.rb'), 'utf-8')).toBe("it 'x' do\nend\n")
  })
})
