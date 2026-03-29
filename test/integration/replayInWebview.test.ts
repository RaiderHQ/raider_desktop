import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSend = vi.fn()
const mockLoadURL = vi.fn().mockResolvedValue(undefined)
const mockExecuteJavaScript = vi.fn().mockResolvedValue(undefined)
const mockFromId = vi.fn()

vi.mock('electron', () => ({
  webContents: {
    fromId: (...args: unknown[]) => mockFromId(...args)
  }
}))

vi.mock('../../src/main/handlers/appState', () => ({
  appState: {
    recorderWebContentsId: null,
    isReplayingInWebview: false,
    mainWindow: {
      webContents: {
        send: (...args: unknown[]) => mockSend(...args)
      }
    }
  }
}))

import replayInWebview, {
  cancelWebviewReplay
} from '../../src/main/handlers/recording/replayInWebview'
import { appState } from '../../src/main/handlers/appState'

describe('replayInWebview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    appState.recorderWebContentsId = null
    appState.isReplayingInWebview = false
    mockFromId.mockReturnValue({
      loadURL: mockLoadURL,
      executeJavaScript: mockExecuteJavaScript
    })
  })

  // 1. Returns error when webview is not registered
  it('returns error when webview is not registered (recorderWebContentsId is null)', async () => {
    appState.recorderWebContentsId = null

    const result = await replayInWebview({} as any, ['@driver.get("https://example.com")'])

    expect(result).toEqual({ success: false, error: 'Webview not registered' })
  })

  // 2. Returns error when webContents.fromId returns null
  it('returns error when webContents.fromId returns null', async () => {
    appState.recorderWebContentsId = 42
    mockFromId.mockReturnValue(null)

    const result = await replayInWebview({} as any, ['@driver.get("https://example.com")'])

    expect(result).toEqual({ success: false, error: 'Webview web contents not found' })
  })

  // 3. Successfully replays a navigate step
  it('successfully replays a @driver.get("url") step (calls wc.loadURL)', async () => {
    appState.recorderWebContentsId = 1

    const promise = replayInWebview({} as any, ['@driver.get("https://example.com")'])
    await vi.runAllTimersAsync()
    const result = await promise

    expect(mockLoadURL).toHaveBeenCalledWith('https://example.com')
    expect(result).toEqual({ success: true })
  })

  // 4. Successfully replays a click step
  it('successfully replays a click step (calls wc.executeJavaScript with click code)', async () => {
    appState.recorderWebContentsId = 1

    const promise = replayInWebview({} as any, [
      '@driver.find_element(:css, "#btn").click'
    ])
    await vi.runAllTimersAsync()
    const result = await promise

    expect(mockExecuteJavaScript).toHaveBeenCalledTimes(1)
    const jsCode = mockExecuteJavaScript.mock.calls[0][0] as string
    expect(jsCode).toContain('.click()')
    expect(jsCode).toContain("document.querySelector('#btn')")
    expect(result).toEqual({ success: true })
  })

  // 5. Successfully replays a type step
  it('successfully replays a type step (calls wc.executeJavaScript with type code)', async () => {
    appState.recorderWebContentsId = 1

    const promise = replayInWebview({} as any, [
      '@driver.find_element(:css, "#input").send_keys("hello")'
    ])
    await vi.runAllTimersAsync()
    const result = await promise

    expect(mockExecuteJavaScript).toHaveBeenCalledTimes(1)
    const jsCode = mockExecuteJavaScript.mock.calls[0][0] as string
    expect(jsCode).toContain("el.value = 'hello'")
    expect(jsCode).toContain("new Event('input'")
    expect(result).toEqual({ success: true })
  })

  // 6. Successfully replays a sendKey step
  it('successfully replays a sendKey step (calls wc.executeJavaScript with keydown)', async () => {
    appState.recorderWebContentsId = 1

    const promise = replayInWebview({} as any, [
      '@driver.find_element(:css, "#input").send_keys(:enter)'
    ])
    await vi.runAllTimersAsync()
    const result = await promise

    expect(mockExecuteJavaScript).toHaveBeenCalledTimes(1)
    const jsCode = mockExecuteJavaScript.mock.calls[0][0] as string
    expect(jsCode).toContain("key: 'Enter'")
    expect(jsCode).toContain("new KeyboardEvent('keydown'")
    expect(result).toEqual({ success: true })
  })

  // 7. Successfully replays a sleep step
  it('successfully replays a sleep step (does not call any webContents methods)', async () => {
    appState.recorderWebContentsId = 1

    const promise = replayInWebview({} as any, ['sleep(2)'])
    await vi.runAllTimersAsync()
    const result = await promise

    expect(mockLoadURL).not.toHaveBeenCalled()
    expect(mockExecuteJavaScript).not.toHaveBeenCalled()
    expect(result).toEqual({ success: true })
  })

  // 8. Handles step failure gracefully
  it('handles step failure gracefully (executeJavaScript throws)', async () => {
    appState.recorderWebContentsId = 1
    mockExecuteJavaScript.mockRejectedValueOnce(new Error('Element not found'))

    const promise = replayInWebview({} as any, [
      '@driver.find_element(:css, "#missing").click'
    ])
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result).toEqual({
      success: false,
      error: 'Step 1 failed: Element not found'
    })
  })

  // 9. Sets isReplayingInWebview to true at start and false on completion
  it('sets isReplayingInWebview to true at start and false on completion', async () => {
    appState.recorderWebContentsId = 1

    let flagDuringReplay = false
    mockLoadURL.mockImplementation(() => {
      flagDuringReplay = appState.isReplayingInWebview
      return Promise.resolve()
    })

    const promise = replayInWebview({} as any, ['@driver.get("https://example.com")'])
    await vi.runAllTimersAsync()
    await promise

    expect(flagDuringReplay).toBe(true)
    expect(appState.isReplayingInWebview).toBe(false)
  })

  // 10. Sets isReplayingInWebview to false on error
  it('sets isReplayingInWebview to false on error', async () => {
    appState.recorderWebContentsId = 1
    mockExecuteJavaScript.mockRejectedValueOnce(new Error('boom'))

    const promise = replayInWebview({} as any, [
      '@driver.find_element(:css, "#x").click'
    ])
    await vi.runAllTimersAsync()
    await promise

    expect(appState.isReplayingInWebview).toBe(false)
  })

  // 11. Sends replay-progress events to mainWindow
  it('sends replay-progress events to mainWindow', async () => {
    appState.recorderWebContentsId = 1

    const promise = replayInWebview({} as any, [
      '@driver.get("https://example.com")',
      'sleep(0)'
    ])
    await vi.runAllTimersAsync()
    await promise

    expect(mockSend).toHaveBeenCalledWith('replay-progress', { current: 1, total: 2 })
    expect(mockSend).toHaveBeenCalledWith('replay-progress', { current: 2, total: 2 })
  })

  // 12. cancelWebviewReplay causes early exit with cancelled: true
  it('cancelWebviewReplay causes early exit with cancelled: true', async () => {
    appState.recorderWebContentsId = 1

    mockLoadURL.mockImplementation(() => {
      cancelWebviewReplay()
      return Promise.resolve()
    })

    const promise = replayInWebview({} as any, [
      '@driver.get("https://example.com")',
      '@driver.get("https://example.com/page2")'
    ])
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result).toEqual({ success: false, cancelled: true })
    // Only the first loadURL should have been called
    expect(mockLoadURL).toHaveBeenCalledTimes(1)
  })
})
