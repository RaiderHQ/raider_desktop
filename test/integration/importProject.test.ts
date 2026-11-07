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

const sidecarFor = (file: string, over: Record<string, unknown> = {}): string =>
  JSON.stringify({
    version: 1,
    id: 'old-id',
    name: 'Pay',
    url: 'http://x.test',
    steps: [nav('http://x.test')],
    file,
    automation: 'selenium',
    hash: 'h',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over
  })
const writeSidecarFile = async (file: string, body: string): Promise<void> => {
  await mkdir(join(source, '.raider', 'tests'), { recursive: true })
  await writeFile(join(source, '.raider', 'tests', `${file}.json`), body)
}

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

  it('imports the top-level *_spec.rb files, one spec file each, and reports the counts', async () => {
    await setActiveProject(project)
    await writeFile(join(source, 'top_spec.rb'), exported('Top'))
    await writeFile(join(source, 'second_spec.rb'), exported('Second'))
    await writeFile(join(source, 'notes.rb'), exported('Not a spec'))
    await writeFile(join(source, 'readme.md'), 'not a test')

    expect(await importProject(win)).toEqual({ success: true, imported: 2, skipped: 0, failed: 0 })

    expect(tests().map((t) => t.name)).toEqual(['Second', 'Top'])
    expect(await readFile(join(project, 'spec', 'top_spec.rb'), 'utf-8')).toContain('http://x.test')
    expect(send).toHaveBeenCalledWith('tests-updated', expect.any(Array))
    // The window is not reloaded: the list follows the broadcast
    expect(reload).not.toHaveBeenCalled()
  })

  it('reads nothing from subfolders and gives no tag for a folder name', async () => {
    await setActiveProject(project)
    await writeFile(join(source, 'top_spec.rb'), exported('Top'))
    await mkdir(join(source, 'smoke'))
    await writeFile(join(source, 'smoke', 'login_spec.rb'), exported('Login'))

    await importProject(win)

    expect(tests().map((t) => t.name)).toEqual(['Top'])
    expect(tests()[0].tags).toBeUndefined()
  })

  it('merges the tags of the sidecar with those of the describe line', async () => {
    await setActiveProject(project)
    await writeFile(
      join(source, 'pay_spec.rb'),
      exported('Pay') + "describe 'Pay', :smoke, :Bad_Tag! do\nend\n"
    )
    await writeSidecarFile('pay_spec.rb', sidecarFor('pay_spec.rb', { tags: ['regression'] }))

    await importProject(win)

    expect(tests()).toEqual([
      expect.objectContaining({ name: 'Pay', tags: ['regression', 'smoke'] })
    ])
    // A fresh id: an import never replaces a test
    expect(appState.tests.has('old-id')).toBe(false)
  })

  it('takes the tags of the describe line when there is no sidecar', async () => {
    await setActiveProject(project)
    await writeFile(
      join(source, 'login_spec.rb'),
      "# Test: Login\ndescribe 'Login', :smoke do\nend\n"
    )

    await importProject(win)

    expect(tests()[0].tags).toEqual(['smoke'])
  })

  it('refuses the whole import for a sidecar whose password step reads another variable', async () => {
    await setActiveProject(project)
    await writeFile(join(source, 'ok_spec.rb'), exported('Ok'))
    await writeFile(join(source, 'pay_spec.rb'), '# Test: Pay\n')
    await writeSidecarFile(
      'pay_spec.rb',
      sidecarFor('pay_spec.rb', {
        steps: [
          {
            id: 'p',
            kind: 'type',
            element: { strategy: 'id', value: 'pw' },
            text: '',
            secret: true,
            secretName: 'GITHUB_TOKEN'
          }
        ]
      })
    )

    const result = await importProject(win)

    expect(result.success).toBe(false)
    expect(result.error).toContain('GITHUB_TOKEN')
    expect(appState.tests.size).toBe(0)
  })

  it('counts a malformed sidecar as failed, logs it, and imports the rest', async () => {
    await setActiveProject(project)
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await writeFile(join(source, 'ok_spec.rb'), exported('Ok'))
    await writeFile(join(source, 'bad_spec.rb'), exported('Bad'))
    await writeSidecarFile('bad_spec.rb', '{not json')

    const result = await importProject(win)

    expect(result).toEqual({
      success: false,
      error: '1 test could not be imported.',
      imported: 1,
      skipped: 0,
      failed: 1
    })
    expect(tests().map((t) => t.name)).toEqual(['Ok'])
    expect(log).toHaveBeenCalled()
  })

  it('skips a test whose name the project already has, and counts it', async () => {
    await setActiveProject(project)
    await writeFile(join(source, 'one_spec.rb'), exported('Same'))
    await writeFile(join(source, 'two_spec.rb'), exported('Fresh'))
    await importProject(win)

    const again = await importProject(win)

    expect(again).toEqual({ success: true, imported: 0, skipped: 2, failed: 0 })
    expect(tests().map((t) => t.file)).toHaveLength(2)
  })

  it('asks before importing hidden custom Ruby and imports nothing on cancel', async () => {
    await setActiveProject(project)
    const custom: Step = { id: 'c', kind: 'custom', code: 'system("id")' }
    await writeFile(
      join(source, 'bad_spec.rb'),
      writeExportHeader({ testName: 'Bad', steps: [custom] })
    )
    mockDialog.showMessageBox.mockResolvedValue({ response: 1 })

    const result = await importProject(win)

    expect(result.success).toBe(false)
    expect(mockDialog.showMessageBox).toHaveBeenCalledTimes(1)
    expect(appState.tests.size).toBe(0)
  })

  it('falls back to the file name when there is no test comment', async () => {
    await setActiveProject(project)
    await writeFile(join(source, 'my_test_spec.rb'), '# no comment\n')

    await importProject(win)

    expect(tests().map((t) => t.name)).toEqual(['my_test'])
  })

  it('parses steps from a legacy file between begin and puts, as Steps', async () => {
    await setActiveProject(project)
    await writeFile(
      join(source, 'step_spec.rb'),
      '# Test: Step Test\nbegin\n  @driver.get("http://x.com")\n  @driver.find_element(:id, "btn").click\n  puts "Test \'Step Test\' passed successfully!"'
    )

    await importProject(win)

    expect(Array.from(appState.tests.values())[0].steps).toEqual([
      { id: expect.any(String), kind: 'navigate', url: 'http://x.com' },
      { id: expect.any(String), kind: 'click', element: { strategy: 'id', value: 'btn' } }
    ])
  })

  it('skips links', async () => {
    await setActiveProject(project)
    await symlink(join(project, 'Gemfile'), join(source, 'link_spec.rb'))
    await writeFile(join(source, 'real_spec.rb'), exported('Real'))

    await importProject(win)

    expect(tests().map((t) => t.name)).toEqual(['Real'])
  })

  it('refuses a folder with no spec files', async () => {
    await setActiveProject(project)
    const result = await importProject(win)
    expect(result).toEqual({ success: false, error: 'There are no *_spec.rb files there.' })
  })

  it('refuses a folder with more than 500 spec files', async () => {
    await setActiveProject(project)
    for (let i = 0; i < 501; i++) await writeFile(join(source, `t${i}_spec.rb`), '# Test: x\n')
    const result = await importProject(win)
    expect(result.success).toBe(false)
    expect(result.error).toContain('500')
    expect(appState.tests.size).toBe(0)
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
