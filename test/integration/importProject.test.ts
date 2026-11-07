import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

const mockDialog = vi.hoisted(() => ({ showOpenDialog: vi.fn(), showMessageBox: vi.fn() }))
const mockUserData = vi.hoisted(() => ({ dir: '' }))
vi.mock('electron', () => ({
  BrowserWindow: class {},
  dialog: mockDialog,
  app: { getPath: (): string => mockUserData.dir }
}))
vi.mock('../../src/main/utils/safeExec', () => ({
  safeExec: vi.fn().mockResolvedValue({ stdout: '{"examples":[]}', stderr: '', exitCode: 0 })
}))

import importProject from '../../src/main/handlers/io/importProject'
import setActiveProject from '../../src/main/handlers/project/setActiveProject'
import { appState } from '../../src/main/handlers/appState'
import { DEFAULT_RECORDER_SETTINGS } from '../../src/main/handlers/config/projectSettings'
import { writeExportHeader } from '../../src/main/codegen/exportHeader'
import type { Step } from '../../src/shared/types/step'

const send = vi.fn()
const reload = vi.fn()
const win = { webContents: { send }, reload } as never

const nav = (url: string): Step => ({ id: `n-${url}`, kind: 'navigate', url })
const exported = (name: string, url = 'http://x.test'): string =>
  writeExportHeader({ testName: name, steps: [nav(url)] }) + '# body\n'

let project: string
let source: string

beforeEach(async () => {
  project = await mkdtemp(join(tmpdir(), 'raider-imp-project-'))
  source = await mkdtemp(join(tmpdir(), 'raider-imp-source-'))
  mockUserData.dir = source
  await writeFile(join(project, 'Gemfile'), "gem 'rspec'\ngem 'selenium-webdriver'\n")
  appState.projectPath = null
  appState.tests = new Map()
  appState.mainWindow = win
  appState.recorderSettings = { ...DEFAULT_RECORDER_SETTINGS }
  vi.clearAllMocks()
  mockDialog.showMessageBox.mockResolvedValue({ response: 0 })
  mockDialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [source] })
})

afterEach(async () => {
  await setActiveProject(null)
  await rm(project, { recursive: true, force: true })
  await rm(source, { recursive: true, force: true })
})

const tests = (): { name: string; tags?: string[]; file?: string }[] =>
  Array.from(appState.tests.values()).sort((a, b) => a.name.localeCompare(b.name))

describe('importProject', () => {
  it('returns error when mainWindow is null', async () => {
    expect(await importProject(null as never)).toEqual({
      success: false,
      error: 'Main window not found'
    })
  })

  it('returns error when the user cancels the directory selection', async () => {
    await setActiveProject(project)
    mockDialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
    expect(await importProject(win)).toEqual({ success: false, error: 'No directory selected' })
  })

  it('says so when no project is open', async () => {
    expect(await importProject(win)).toEqual({ success: false, error: 'No project is open.' })
  })

  it('imports every .rb file under the folder, as tests with a spec file each', async () => {
    await setActiveProject(project)
    await writeFile(join(source, 'top.rb'), exported('Top'))
    await mkdir(join(source, 'checkout'))
    await writeFile(join(source, 'checkout', 'pay.rb'), exported('Pay'))
    await writeFile(join(source, 'readme.md'), 'not a test')

    expect(await importProject(win)).toEqual({ success: true })

    expect(tests().map((t) => t.name)).toEqual(['Pay', 'Top'])
    expect(tests().every((t) => t.file?.startsWith('spec/'))).toBe(true)
    expect(await readFile(join(project, 'spec', 'top_spec.rb'), 'utf-8')).toContain('http://x.test')
    expect(send).toHaveBeenCalledWith('tests-updated', expect.any(Array))
    expect(reload).toHaveBeenCalled()
  })

  it('tags the tests of a subfolder with the folder name, run through the tag rule', async () => {
    await setActiveProject(project)
    await writeFile(join(source, 'top.rb'), exported('Top'))
    await mkdir(join(source, 'Smoke tests'))
    await writeFile(join(source, 'Smoke tests', 'login.rb'), exported('Login'))
    await mkdir(join(source, '2nd wave'))
    await writeFile(join(source, '2nd wave', 'cart.rb'), exported('Cart'))

    await importProject(win)

    const byName = Object.fromEntries(tests().map((t) => [t.name, t.tags]))
    expect(byName.Top).toBeUndefined()
    expect(byName.Login).toEqual(['smoke_tests'])
    expect(byName.Cart).toEqual(['t_2nd_wave'])
    expect(await readFile(join(project, 'spec', 'login_spec.rb'), 'utf-8')).toContain(
      "describe 'Login', :smoke_tests do"
    )
  })

  it('keeps the tags and steps of an export, from the sidecars written beside it', async () => {
    await setActiveProject(project)
    await writeFile(join(source, 'pay_spec.rb'), exported('Pay'))
    await mkdir(join(source, '.raider', 'tests'), { recursive: true })
    await writeFile(
      join(source, '.raider', 'tests', 'pay_spec.rb.json'),
      JSON.stringify({
        version: 1,
        id: 'old-id',
        name: 'Pay',
        url: 'http://x.test',
        steps: [nav('http://x.test')],
        file: 'pay_spec.rb',
        automation: 'selenium',
        hash: 'h',
        tags: ['smoke', 'regression'],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z'
      })
    )

    await importProject(win)

    expect(tests()).toEqual([
      expect.objectContaining({ name: 'Pay', tags: ['regression', 'smoke'] })
    ])
    // A fresh id: an import never replaces a test
    expect(appState.tests.has('old-id')).toBe(false)
  })

  it('asks before importing hidden custom Ruby and imports nothing on cancel', async () => {
    await setActiveProject(project)
    const custom: Step = { id: 'c', kind: 'custom', code: 'system("id")' }
    await writeFile(join(source, 'bad.rb'), writeExportHeader({ testName: 'Bad', steps: [custom] }))
    mockDialog.showMessageBox.mockResolvedValue({ response: 1 })

    const result = await importProject(win)

    expect(result.success).toBe(false)
    expect(mockDialog.showMessageBox).toHaveBeenCalledTimes(1)
    expect(appState.tests.size).toBe(0)
  })

  it('adds to the tests the project has: it replaces nothing', async () => {
    await setActiveProject(project)
    await writeFile(join(source, 'one.rb'), exported('Same'))
    await importProject(win)
    await importProject(win)

    expect(tests().map((t) => t.file)).toEqual(['spec/same_spec.rb', 'spec/same_2_spec.rb'])
  })

  it('falls back to the file name when there is no test comment', async () => {
    await setActiveProject(project)
    await writeFile(join(source, 'my_test.rb'), '# no comment\n')

    await importProject(win)

    expect(tests().map((t) => t.name)).toEqual(['my_test'])
  })

  it('parses steps from a legacy file between begin and puts, as Steps', async () => {
    await setActiveProject(project)
    await writeFile(
      join(source, 'step.rb'),
      '# Test: Step Test\nbegin\n  @driver.get("http://x.com")\n  @driver.find_element(:id, "btn").click\n  puts "Test \'Step Test\' passed successfully!"'
    )

    await importProject(win)

    expect(tests()).toHaveLength(1)
    expect(Array.from(appState.tests.values())[0].steps).toEqual([
      { id: expect.any(String), kind: 'navigate', url: 'http://x.com' },
      { id: expect.any(String), kind: 'click', element: { strategy: 'id', value: 'btn' } }
    ])
  })

  it('skips .raider, hidden tooling folders and symlinks', async () => {
    await setActiveProject(project)
    await mkdir(join(source, 'node_modules'))
    await writeFile(join(source, 'node_modules', 'dep.rb'), exported('Dep'))
    await mkdir(join(source, '.raider'))
    await writeFile(join(source, '.raider', 'x.rb'), exported('Hidden'))
    await symlink(join(project, 'Gemfile'), join(source, 'link.rb'))
    await writeFile(join(source, 'real.rb'), exported('Real'))

    await importProject(win)

    expect(tests().map((t) => t.name)).toEqual(['Real'])
  })

  it('returns the error when the folder cannot be read', async () => {
    await setActiveProject(project)
    mockDialog.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [join(source, 'does-not-exist')]
    })

    const result = await importProject(win)

    expect(result.success).toBe(false)
    expect(result.error).toContain('ENOENT')
  })
})
