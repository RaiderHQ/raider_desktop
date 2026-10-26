import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

const mockSafeExec = vi.hoisted(() => vi.fn())
vi.mock('electron', () => ({ BrowserWindow: class {}, app: { getPath: (): string => '/' } }))
vi.mock('../../../src/main/utils/safeExec', () => ({ safeExec: mockSafeExec }))

import setActiveProject from '../../../src/main/handlers/project/setActiveProject'
import {
  getProjectLayoutHandler,
  listProjectTestsHandler,
  openCodeTestHandler,
  runProjectFileHandler
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

  it('open-code-test refuses without a project', async () => {
    await setActiveProject(null)
    await expect(openCodeTestHandler('spec/a_spec.rb')).rejects.toThrow()
  })

  it('run-project-file runs a listed file from the project', async () => {
    await setActiveProject(project)
    const result = await runProjectFileHandler('spec/a_spec.rb', 'ruby')
    expect(result.success).toBe(true)
    const [command, options] = mockSafeExec.mock.calls[0]
    expect(command).toContain('-S rspec')
    expect(command).toContain('spec/a_spec.rb')
    expect(command).toContain('--format json')
    expect(options.cwd).toBe(project)
  })

  it('run-project-file refuses unlisted paths and runs nothing', async () => {
    await setActiveProject(project)
    for (const bad of [
      join(outside, 'secret_spec.rb'),
      '../x_spec.rb',
      'helper.rb',
      'spec/link_spec.rb'
    ]) {
      const result = await runProjectFileHandler(bad, 'ruby')
      expect(result.success, bad).toBe(false)
    }
    expect(mockSafeExec).not.toHaveBeenCalled()
  })

  it('run-project-file refuses without a project', async () => {
    await setActiveProject(null)
    expect((await runProjectFileHandler('spec/a_spec.rb', 'ruby')).success).toBe(false)
    expect(mockSafeExec).not.toHaveBeenCalled()
  })

  it('reports a failed run', async () => {
    await setActiveProject(project)
    mockSafeExec.mockResolvedValue({ stdout: 'o', stderr: 'boom', exitCode: 1 })
    const result = await runProjectFileHandler('spec/a_spec.rb', 'ruby')
    expect(result.success).toBe(false)
    expect(result.output).toContain('boom')
  })
})
