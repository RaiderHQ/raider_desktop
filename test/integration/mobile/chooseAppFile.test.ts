import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, mkdir, rm, realpath } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

const showOpenDialog = vi.fn()
vi.mock('electron', () => ({
  BrowserWindow: class {},
  app: { getPath: (): string => '/' },
  dialog: { showOpenDialog: (...args: unknown[]): unknown => showOpenDialog(...args) }
}))
vi.mock('../../../src/main/utils/safeExec', () => ({
  safeExec: vi.fn().mockResolvedValue({ stdout: '{"examples":[]}', stderr: '', exitCode: 0 })
}))

import setActiveProject from '../../../src/main/handlers/project/setActiveProject'
import { chooseAppFileHandler } from '../../../src/main/handlers/mobile/chooseAppFile'

let project: string
let outside: string

beforeEach(async () => {
  showOpenDialog.mockReset()
  project = await mkdtemp(join(tmpdir(), 'choose-app-'))
  outside = await mkdtemp(join(tmpdir(), 'choose-app-outside-'))
  await mkdir(join(project, 'builds', 'My App.app'), { recursive: true })
  await mkdir(join(outside, 'Other.app'), { recursive: true })
  await setActiveProject(project)
})

afterEach(async () => {
  await setActiveProject(null)
  await rm(project, { recursive: true, force: true })
  await rm(outside, { recursive: true, force: true })
})

describe('choose-app-file', () => {
  it('returns a path inside the project relative to it, with forward slashes', async () => {
    showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [join(project, 'builds', 'My App.app')]
    })
    expect(await chooseAppFileHandler(project, 'ios')).toEqual({ path: 'builds/My App.app' })
  })

  it('treats the project through its real path, so a symlinked tmp folder still counts as inside', async () => {
    showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [join(await realpath(project), 'builds', 'My App.app')]
    })
    expect(await chooseAppFileHandler(project, 'ios')).toEqual({ path: 'builds/My App.app' })
  })

  it('returns a path outside the project as the absolute path picked', async () => {
    const picked = join(outside, 'Other.app')
    showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [picked] })
    expect(await chooseAppFileHandler(project, 'ios')).toEqual({ path: picked })
  })

  it('does not count a sibling folder that shares the project name prefix as inside', async () => {
    const sibling = `${project}-copy`
    await mkdir(join(sibling, 'a.apk'), { recursive: true })
    try {
      showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [join(sibling, 'a.apk')] })
      expect(await chooseAppFileHandler(project, 'android')).toEqual({
        path: join(sibling, 'a.apk')
      })
    } finally {
      await rm(sibling, { recursive: true, force: true })
    }
  })

  it('returns cancelled when the dialog is closed', async () => {
    showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
    expect(await chooseAppFileHandler(project, 'android')).toEqual({ cancelled: true })
  })

  it('lets iOS pick an .app bundle or an .ipa', async () => {
    showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
    await chooseAppFileHandler(project, 'ios')
    const options = showOpenDialog.mock.calls[0][0]
    expect(options.properties).toEqual(expect.arrayContaining(['openFile', 'openDirectory']))
    // Without 'treatPackageAsDirectory', macOS picks a .app bundle whole
    expect(options.properties).not.toContain('treatPackageAsDirectory')
    expect(options.filters).toEqual([{ name: expect.any(String), extensions: ['app', 'ipa'] }])
  })

  it('lets Android pick an .apk or an .aab file', async () => {
    showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
    await chooseAppFileHandler(project, 'android')
    const options = showOpenDialog.mock.calls[0][0]
    expect(options.properties).toEqual(['openFile'])
    expect(options.filters).toEqual([{ name: expect.any(String), extensions: ['apk', 'aab'] }])
  })

  it('refuses a project that is not open, without opening the dialog', async () => {
    expect(await chooseAppFileHandler(outside, 'ios')).toEqual({ error: expect.any(String) })
    expect(showOpenDialog).not.toHaveBeenCalled()
  })

  it('refuses an unknown platform', async () => {
    expect(await chooseAppFileHandler(project, 'windows')).toEqual({ error: expect.any(String) })
    expect(showOpenDialog).not.toHaveBeenCalled()
  })

  it('returns an error when the dialog fails', async () => {
    showOpenDialog.mockRejectedValue(new Error('boom'))
    expect(await chooseAppFileHandler(project, 'ios')).toEqual({ error: expect.any(String) })
  })
})
