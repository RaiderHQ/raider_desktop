import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', () => ({ BrowserWindow: class {} }))

import { appState } from '../../src/main/handlers/appState'
import { DEFAULT_RECORDER_SETTINGS } from '../../src/main/handlers/config/projectSettings'
import setActiveProject, { getRecorderSettings } from '../../src/main/handlers/project/setActiveProject'
import startRecordingMain from '../../src/main/handlers/recording/startRecordingMain'
import loadUrlRequest from '../../src/main/handlers/loadUrlRequest'
import updateRecordingSettings from '../../src/main/handlers/config/updateRecordingSettings'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'active-project-'))
  await mkdir(join(dir, 'config'), { recursive: true })
  await writeFile(
    join(dir, 'config', 'config.yml'),
    'url: https://example.test/\nimplicit_wait: 3\nexplicit_wait: 15\n'
  )
  appState.projectPath = null
  appState.sessionUrl = null
  appState.recorderSettings = { ...DEFAULT_RECORDER_SETTINGS }
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('setActiveProject', () => {
  it('getRecorderSettings waits for an in-flight activation', async () => {
    void setActiveProject(dir)
    const settings = await getRecorderSettings()
    expect(settings.implicitWait).toBe(3)
    expect(settings.explicitWait).toBe(15)
  })

  it('loads settings from the project config', async () => {
    const result = await setActiveProject(dir)
    expect(result.success).toBe(true)
    expect(appState.projectPath).toBe(dir)
    expect(appState.recorderSettings.baseUrl).toBe('https://example.test/')
    expect(appState.recorderSettings.implicitWait).toBe(3)
    expect(appState.recorderSettings.explicitWait).toBe(15)
    expect(result.settings).toEqual(appState.recorderSettings)
  })

  it('null resets to defaults and clears projectPath and sessionUrl', async () => {
    await setActiveProject(dir)
    appState.sessionUrl = 'https://other.test/'
    const result = await setActiveProject(null)
    expect(result.success).toBe(true)
    expect(appState.projectPath).toBeNull()
    expect(appState.sessionUrl).toBeNull()
    expect(appState.recorderSettings).toEqual(DEFAULT_RECORDER_SETTINGS)
  })
})

describe('recording start URL', () => {
  it('uses recorderSettings.baseUrl when sessionUrl is null', async () => {
    await setActiveProject(dir)
    expect(startRecordingMain().url).toBe('https://example.test/')
  })

  it('uses sessionUrl when set via loadUrlRequest', async () => {
    await setActiveProject(dir)
    loadUrlRequest('https://session.test/')
    expect(appState.sessionUrl).toBe('https://session.test/')
    expect(startRecordingMain().url).toBe('https://session.test/')
  })

  it('an empty loadUrlRequest clears the session URL so the base URL applies', async () => {
    await setActiveProject(dir)
    loadUrlRequest('https://session.test/')
    loadUrlRequest('')
    expect(appState.sessionUrl).toBeNull()
    expect(startRecordingMain().url).toBe('https://example.test/')
  })

  it('does not start when there is no URL anywhere', async () => {
    await writeFile(join(dir, 'config', 'config.yml'), 'explicit_wait: 15\n')
    await setActiveProject(dir)
    const send = vi.fn()
    appState.mainWindow = { webContents: { send } } as never
    appState.activeTraceDir = null
    const result = startRecordingMain()
    appState.mainWindow = null
    expect(result.success).toBe(false)
    expect(appState.activeTraceDir).toBeNull()
    expect(send).not.toHaveBeenCalled()
  })
})

describe('updateRecordingSettings', () => {
  it('fails with no active project', async () => {
    expect(await updateRecordingSettings({ implicitWait: 1 })).toEqual({
      success: false,
      error: 'No project open'
    })
  })

  it('writes the patch to config and updates appState', async () => {
    await setActiveProject(dir)
    const result = await updateRecordingSettings({ explicitWait: 42, selectorPriority: ['css'] })
    expect(result.success).toBe(true)
    expect(appState.recorderSettings.explicitWait).toBe(42)
    expect(appState.recorderSettings.selectorPriority).toEqual(['css'])
    await setActiveProject(dir)
    expect(appState.recorderSettings.explicitWait).toBe(42)
  })
})
