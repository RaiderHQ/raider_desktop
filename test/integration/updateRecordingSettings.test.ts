import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({ BrowserWindow: class {} }))
const writeRecorderSettings = vi.hoisted(() => vi.fn())
vi.mock('../../src/main/handlers/config/projectSettings', async (importActual) => {
  const actual =
    await importActual<typeof import('../../src/main/handlers/config/projectSettings')>()
  return { ...actual, writeRecorderSettings }
})

import handler, { validSettingsPatch } from '../../src/main/handlers/config/updateRecordingSettings'
import { appState } from '../../src/main/handlers/appState'
import { generateRspecFile } from '../../src/main/codegen/testFile'

describe('validSettingsPatch', () => {
  it('keeps finite non-negative waits and string priorities', () => {
    expect(
      validSettingsPatch({ implicitWait: 0, explicitWait: 12.5, selectorPriority: ['id', 'css'] })
    ).toEqual({ implicitWait: 0, explicitWait: 12.5, selectorPriority: ['id', 'css'] })
    expect(validSettingsPatch({ explicitWait: 30 })).toEqual({ explicitWait: 30 })
  })

  // The waits are written into generated Ruby, so a string would be code
  it.each([
    [{ explicitWait: "10; system('id')" }],
    [{ explicitWait: -1 }],
    [{ explicitWait: Number.NaN }],
    [{ explicitWait: Number.POSITIVE_INFINITY }],
    [{ implicitWait: '5' }],
    [{ selectorPriority: ['id', 3] }],
    [{ selectorPriority: 'id' }],
    [null],
    ['x']
  ])('refuses %j', (patch) => {
    expect(validSettingsPatch(patch)).toBeNull()
  })

  it('drops fields a renderer may not set', () => {
    expect(validSettingsPatch({ explicitWait: 1, browser: 'firefox', headless: true })).toEqual({
      explicitWait: 1
    })
  })
})

describe('update-recording-settings handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    appState.projectPath = '/p'
    appState.recorderSettings = { ...appState.recorderSettings, explicitWait: 10 }
  })

  it('writes and applies a valid patch', async () => {
    writeRecorderSettings.mockResolvedValue(undefined)
    expect(await handler({ explicitWait: 20 })).toEqual({ success: true })
    expect(writeRecorderSettings).toHaveBeenCalledWith('/p', { explicitWait: 20 })
    expect(appState.recorderSettings.explicitWait).toBe(20)
  })

  it('refuses an invalid patch without writing or applying it', async () => {
    const result = await handler({ explicitWait: "10; system('id')" } as never)
    expect(result).toEqual({ success: false, error: 'The settings are not valid.' })
    expect(writeRecorderSettings).not.toHaveBeenCalled()
    expect(appState.recorderSettings.explicitWait).toBe(10)
  })
})

describe('generateRspecFile wait value', () => {
  it('is always rendered as a number', () => {
    const code = generateRspecFile(
      { name: 'T', steps: [] },
      { browser: 'chrome', headless: false, explicitWait: "10; system('id')" as never }
    )
    expect(code).toContain('Raider.timeout = NaN')
    expect(code).not.toContain('system')
  })
})
