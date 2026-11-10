import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, readdir, rm, access, symlink, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

const mockDialog = vi.hoisted(() => ({ showSaveDialog: vi.fn(), showOpenDialog: vi.fn() }))
vi.mock('electron', () => ({
  BrowserWindow: { getFocusedWindow: vi.fn() },
  dialog: mockDialog
}))

import { BrowserWindow } from 'electron'
import exportProject from '../../src/main/handlers/io/exportProject'
import { appState } from '../../src/main/handlers/appState'
import { DEFAULT_RECORDER_SETTINGS } from '../../src/main/handlers/config/projectSettings'
import { readExportHeader } from '../../src/main/codegen/exportHeader'
import { readSidecar } from '../../src/main/handlers/tests/sidecar'
import type { Step } from '../../src/shared/types/step'
import type { Test } from '../../src/shared/types/test'

const mockGetFocusedWindow = BrowserWindow.getFocusedWindow as ReturnType<typeof vi.fn>
const fakeWindow = { id: 1 }

const nav = (url: string): Step => ({ id: `n-${url}`, kind: 'navigate', url })
const test = (id: string, name: string, tags?: string[]): Test => ({
  id,
  name,
  url: 'https://x.test',
  steps: [nav('https://x.test')],
  ...(tags && { tags })
})

let dir: string
let out: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'raider-export-'))
  out = join(dir, 'raider-project')
  vi.clearAllMocks()
  mockGetFocusedWindow.mockReturnValue(fakeWindow)
  appState.tests = new Map()
  appState.projectPath = null
  appState.projectFramework = 'rspec'
  appState.projectAutomation = 'selenium'
  appState.recorderSettings = { ...DEFAULT_RECORDER_SETTINGS }
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const exists = (p: string): Promise<boolean> =>
  access(p).then(
    () => true,
    () => false
  )

describe('exportProject handler', () => {
  it('returns error when no focused window is available', async () => {
    mockGetFocusedWindow.mockReturnValue(null)
    const result = await exportProject()
    expect(result.success).toBe(false)
    expect(result.error).toContain('No focused window')
  })

  it('returns error when user cancels dialog', async () => {
    mockDialog.showSaveDialog.mockResolvedValue({ canceled: true, filePath: undefined })
    const result = await exportProject()
    expect(result.success).toBe(false)
    expect(result.error).toContain('cancelled')
  })

  it('creates the project directory if it does not exist', async () => {
    mockDialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: out })
    const result = await exportProject()
    expect(result).toEqual({ success: true, path: out })
    expect(await exists(out)).toBe(true)
    expect(await readdir(out)).toEqual([])
  })

  it('never exports a flow as a spec', async () => {
    appState.tests.set('t1', test('t1', 'Login test'))
    appState.tests.set('f1', { ...test('f1', 'Fill hours'), kind: 'flow' })
    mockDialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: out })

    expect(await exportProject()).toEqual({ success: true, path: out })
    expect(await readdir(out)).not.toContain('fill_hours_spec.rb')
    expect(await readdir(out)).toContain('login_test_spec.rb')
  })

  it('writes one spec file per test, flat, with no suite folders', async () => {
    appState.tests.set('t1', test('t1', 'Login test'))
    appState.tests.set('t2', test('t2', 'Signup test'))
    appState.tests.set('t3', test('t3', 'Load dashboard'))
    mockDialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: out })

    const result = await exportProject()

    expect(result).toEqual({ success: true, path: out })
    expect((await readdir(out)).sort()).toEqual([
      '.raider',
      'load_dashboard_spec.rb',
      'login_test_spec.rb',
      'signup_test_spec.rb'
    ])
    const text = await readFile(join(out, 'login_test_spec.rb'), 'utf-8')
    expect(text).not.toContain('# Suite:')
    expect(readExportHeader(text)).toMatchObject({
      testName: 'Login test',
      steps: [nav('https://x.test')]
    })
  })

  it('writes the sidecar of each test under .raider/tests, with its tags', async () => {
    appState.tests.set('t1', test('t1', 'Login', ['regression', 'smoke']))
    mockDialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: out })

    await exportProject()

    const sidecar = await readSidecar(out, 'login_spec.rb')
    expect(sidecar).toMatchObject({
      id: 't1',
      name: 'Login',
      file: 'login_spec.rb',
      tags: ['regression', 'smoke'],
      steps: [nav('https://x.test')]
    })
    expect(await readFile(join(out, 'login_spec.rb'), 'utf-8')).toContain(
      "describe 'Login', :regression, :smoke do"
    )
  })

  it('gives two tests with the same name two files', async () => {
    appState.tests.set('t1', test('t1', 'Same'))
    appState.tests.set('t2', test('t2', 'Same'))
    mockDialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: out })

    await exportProject()

    expect((await readdir(out)).filter((f) => f.endsWith('.rb')).sort()).toEqual([
      'same_2_spec.rb',
      'same_spec.rb'
    ])
  })

  it('sets file permissions on non-windows platforms', async () => {
    appState.tests.set('t1', test('t1', 'Test'))
    mockDialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: out })
    const { stat } = await import('fs/promises')

    await exportProject()

    if (process.platform !== 'win32') {
      expect((await stat(join(out, 'test_spec.rb'))).mode & 0o777).toBe(0o755)
    }
  })

  it('returns the error when the folder cannot be written', async () => {
    appState.tests.set('t1', test('t1', 'Test'))
    await writeFile(join(dir, 'a-file'), 'x')
    mockDialog.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: join(dir, 'a-file', 'deeper')
    })

    const result = await exportProject()

    expect(result.success).toBe(false)
  })

  it('refuses a folder inside the open project, by real path', async () => {
    const project = join(dir, 'project')
    await mkdir(project)
    await symlink(project, join(dir, 'alias'))
    appState.projectPath = project
    appState.tests.set('t1', test('t1', 'Test'))
    for (const target of [project, join(project, 'out'), join(dir, 'alias', 'out')]) {
      mockDialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: target })
      const result = await exportProject()
      expect(result).toEqual({ success: false, error: 'Choose a folder outside the open project.' })
    }
    expect(await readdir(project)).toEqual([])
    appState.projectPath = null
  })

  it('refuses a folder that already holds spec files or a .raider folder', async () => {
    appState.tests.set('t1', test('t1', 'Test'))
    mockDialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: out })
    await mkdir(out)
    await writeFile(join(out, 'test_spec.rb'), 'mine')

    expect(await exportProject()).toEqual({ success: false, error: 'Choose an empty folder.' })
    expect(await readFile(join(out, 'test_spec.rb'), 'utf-8')).toBe('mine')

    await rm(join(out, 'test_spec.rb'))
    await mkdir(join(out, '.raider'))
    expect(await exportProject()).toEqual({ success: false, error: 'Choose an empty folder.' })
    expect(await readdir(out)).toEqual(['.raider'])
  })

  it('accepts a folder that holds other things', async () => {
    appState.tests.set('t1', test('t1', 'Test'))
    await mkdir(out)
    await writeFile(join(out, 'notes.txt'), 'x')
    mockDialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: out })
    expect((await exportProject()).success).toBe(true)
  })

  it('never overwrites a record that appears while it writes', async () => {
    appState.tests.set('t1', test('t1', 'Test'))
    mockDialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: out })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const sidecars = await import('../../src/main/handlers/tests/sidecar')
    const real = sidecars.writeSidecar
    vi.spyOn(sidecars, 'writeSidecar').mockImplementationOnce(async (root, sidecar, options) => {
      const mine = join(root, '.raider', 'tests', 'test_spec.rb.json')
      await mkdir(join(root, '.raider', 'tests'), { recursive: true })
      await writeFile(mine, 'someone else')
      return real(root, sidecar, options)
    })

    const result = await exportProject()

    expect(result.success).toBe(false)
    expect(await readFile(join(out, '.raider', 'tests', 'test_spec.rb.json'), 'utf-8')).toBe(
      'someone else'
    )
  })

  it('never overwrites a file that appears while it writes', async () => {
    appState.tests.set('t1', test('t1', 'Test'))
    mockDialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: out })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    // The file shows up after the folder was checked
    const promises = await import('fs/promises')
    const real = promises.default.writeFile
    vi.spyOn(promises.default, 'writeFile').mockImplementationOnce(async (...args) => {
      await real(args[0] as string, 'someone else', 'utf8')
      return real(...(args as Parameters<typeof real>))
    })

    const result = await exportProject()

    expect(result.success).toBe(false)
    expect(result.error).toBe('1 test could not be exported.')
    expect(await readFile(join(out, 'test_spec.rb'), 'utf-8')).toBe('someone else')
  })

  it('calls showSaveDialog with the right default path', async () => {
    mockDialog.showSaveDialog.mockResolvedValue({ canceled: true, filePath: undefined })
    await exportProject()
    expect(mockDialog.showSaveDialog).toHaveBeenCalledWith(
      fakeWindow,
      expect.objectContaining({ defaultPath: 'raider-project', title: 'Export Project' })
    )
  })
})
