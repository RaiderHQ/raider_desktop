import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({ BrowserWindow: class {} }))
const migrateRecordedTests = vi.hoisted(() => vi.fn())
const loadRecordedTests = vi.hoisted(() => vi.fn())
vi.mock('../../src/main/handlers/tests/migrateRecordedTests', () => ({ migrateRecordedTests }))
vi.mock('../../src/main/handlers/tests/loadTests', () => ({ loadRecordedTests }))
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

  it('keeps a test id attribute name the runtime accepts', () => {
    expect(validSettingsPatch({ testIdAttribute: 'data-qa' })).toEqual({ testIdAttribute: 'data-qa' })
  })

  it.each([[''], ['data qa'], ['1abc'], ['a"b'], ['a:b'], [3]])(
    'refuses the test id attribute %j',
    (value) => {
      expect(validSettingsPatch({ testIdAttribute: value })).toBeNull()
    }
  )

  it('drops fields a renderer may not set', () => {
    expect(validSettingsPatch({ explicitWait: 1, browser: 'firefox', headless: true })).toEqual({
      explicitWait: 1
    })
  })
})

describe('update-recording-settings handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    migrateRecordedTests.mockResolvedValue(0)
    loadRecordedTests.mockResolvedValue([])
    appState.projectPath = '/p'
    appState.recorderSettings = { ...appState.recorderSettings, explicitWait: 10 }
  })

  it('writes and applies a valid patch', async () => {
    writeRecorderSettings.mockResolvedValue(undefined)
    expect(await handler({ explicitWait: 20 })).toEqual({ success: true })
    expect(writeRecorderSettings).toHaveBeenCalledWith('/p', { explicitWait: 20 })
    expect(appState.recorderSettings.explicitWait).toBe(20)
  })

  it('does not apply a patch to a project opened while it was being written', async () => {
    let finish: () => void = () => {}
    writeRecorderSettings.mockReturnValue(new Promise<void>((r) => (finish = r)))
    const pending = handler({ explicitWait: 20 })
    appState.projectPath = '/other'
    appState.recorderSettings = { ...appState.recorderSettings, explicitWait: 5 }
    finish()
    expect(await pending).toEqual({ success: true })
    expect(writeRecorderSettings).toHaveBeenCalledWith('/p', { explicitWait: 20 })
    expect(appState.recorderSettings.explicitWait).toBe(5)
  })

  it('applies a new test id attribute to the settings and the project layout', async () => {
    writeRecorderSettings.mockResolvedValue(undefined)
    appState.layout = { testIdAttribute: 'data-testid' } as never
    expect(await handler({ testIdAttribute: 'data-qa' })).toEqual({ success: true })
    expect(appState.recorderSettings.testIdAttribute).toBe('data-qa')
    expect(appState.layout?.testIdAttribute).toBe('data-qa')
  })

  it('rewrites the recorded specs and reloads the tests when the attribute changes', async () => {
    writeRecorderSettings.mockResolvedValue(undefined)
    migrateRecordedTests.mockResolvedValue(2)
    loadRecordedTests.mockResolvedValue([{ id: 't1', name: 'T', url: '', steps: [] }])
    const send = vi.fn()
    appState.mainWindow = { webContents: { send } } as never
    appState.layout = { testIdAttribute: 'data-testid' } as never
    appState.recorderSettings = { ...appState.recorderSettings, testIdAttribute: 'data-testid' }
    await handler({ testIdAttribute: 'data-qa' })
    expect(migrateRecordedTests).toHaveBeenCalledWith(
      '/p',
      expect.objectContaining({ testIdAttribute: 'data-qa' }),
      { force: true }
    )
    expect([...appState.tests.keys()]).toEqual(['t1'])
    expect(send).toHaveBeenCalledWith('tests-updated', [expect.objectContaining({ id: 't1' })])
  })

  it('runs one regeneration at a time and once more for a change made during it', async () => {
    writeRecorderSettings.mockResolvedValue(undefined)
    let finishFirst: () => void = () => {}
    let running = 0
    let most = 0
    migrateRecordedTests.mockImplementation(async () => {
      running++
      most = Math.max(most, running)
      if (migrateRecordedTests.mock.calls.length === 1) await new Promise<void>((r) => (finishFirst = r))
      running--
      return 0
    })
    appState.layout = { testIdAttribute: 'a' } as never
    const first = handler({ testIdAttribute: 'b1' })
    await new Promise((r) => setTimeout(r, 0))
    const second = handler({ testIdAttribute: 'c1' })
    await new Promise((r) => setTimeout(r, 0))
    finishFirst()
    await Promise.all([first, second])
    expect(most).toBe(1)
    expect(migrateRecordedTests).toHaveBeenCalledTimes(2)
    expect(migrateRecordedTests.mock.calls[1][1]).toEqual(expect.objectContaining({ testIdAttribute: 'c1' }))
  })

  it('rewrites nothing when the attribute is unchanged', async () => {
    writeRecorderSettings.mockResolvedValue(undefined)
    appState.layout = { testIdAttribute: 'data-qa' } as never
    appState.recorderSettings = { ...appState.recorderSettings, testIdAttribute: 'data-qa' }
    await handler({ testIdAttribute: 'data-qa' })
    expect(migrateRecordedTests).not.toHaveBeenCalled()
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
