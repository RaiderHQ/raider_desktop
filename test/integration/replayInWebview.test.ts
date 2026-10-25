import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'

const mockSend = vi.fn()
const mockExecuteJavaScript = vi.fn()
const mockFromId = vi.fn()
const emitter = new EventEmitter()
const mockLoadURL = vi.fn()

vi.mock('electron', () => ({
  webContents: {
    fromId: (...args: unknown[]): unknown => mockFromId(...args)
  }
}))

vi.mock('../../src/main/handlers/appState', () => ({
  appState: {
    recorderWebContentsId: null,
    isReplayingInWebview: false,
    recorderSettings: { explicitWait: 1 },
    mainWindow: {
      webContents: {
        send: (...args: unknown[]): unknown => mockSend(...args)
      }
    }
  }
}))

import replayInWebview, {
  cancelWebviewReplay
} from '../../src/main/handlers/recording/replayInWebview'
import { appState } from '../../src/main/handlers/appState'
import type { ElementTarget, Step } from '../../src/shared/types/step'

const el: ElementTarget = { strategy: 'css', value: '#btn', label: 'Login button' }
type ReplayResult = Awaited<ReturnType<typeof replayInWebview>>
const replay = (steps: Step[]): Promise<ReplayResult> =>
  replayInWebview({} as Electron.IpcMainInvokeEvent, steps)
const run = async (steps: Step[]): Promise<ReplayResult> => {
  const promise = replay(steps)
  await vi.runAllTimersAsync()
  return promise
}
const jsAt = (n: number): string => mockExecuteJavaScript.mock.calls[n][0] as string

describe('replayInWebview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    emitter.removeAllListeners()
    appState.recorderWebContentsId = 1
    appState.isReplayingInWebview = false
    mockExecuteJavaScript.mockReset().mockResolvedValue({ found: true })
    // loadURL finishes, then the page stops loading
    mockLoadURL.mockReset().mockImplementation(async () => {
      setTimeout(() => emitter.emit('did-stop-loading'), 50)
    })
    mockFromId.mockReturnValue({
      loadURL: mockLoadURL,
      executeJavaScript: mockExecuteJavaScript,
      once: (e: string, cb: () => void) => emitter.once(e, cb),
      removeListener: (e: string, cb: () => void) => emitter.removeListener(e, cb)
    })
  })

  it('returns error when webview is not registered', async () => {
    appState.recorderWebContentsId = null
    expect(await replay([])).toEqual({ success: false, error: 'Webview not registered' })
  })

  it('returns error when webContents.fromId returns null', async () => {
    mockFromId.mockReturnValue(null)
    expect(await replay([])).toEqual({ success: false, error: 'Webview web contents not found' })
  })

  it('navigates and waits for did-stop-loading', async () => {
    const result = await run([{ id: '1', kind: 'navigate', url: 'https://example.com' }])
    expect(mockLoadURL).toHaveBeenCalledWith('https://example.com')
    expect(emitter.listenerCount('did-stop-loading')).toBe(0)
    expect(result).toEqual({ success: true, skippedStepIds: [] })
  })

  it('does not hang on navigate when the page never stops loading', async () => {
    mockLoadURL.mockResolvedValue(undefined)
    const result = await run([{ id: '1', kind: 'navigate', url: 'https://example.com' }])
    expect(result).toEqual({ success: true, skippedStepIds: [] })
  })

  it('clicks an element', async () => {
    const result = await run([{ id: '1', kind: 'click', element: el }])
    expect(jsAt(0)).toContain('el.click()')
    expect(jsAt(0)).toContain(`document.querySelector(${JSON.stringify('#btn')})`)
    expect(result).toEqual({ success: true, skippedStepIds: [] })
  })

  it('types through the native value setter and fires input and change', async () => {
    await run([{ id: '1', kind: 'type', element: el, text: 'hello' }])
    expect(jsAt(0)).toContain('getOwnPropertyDescriptor(proto')
    expect(jsAt(0)).toContain(`setter.call(el, ${JSON.stringify('hello')})`)
    expect(jsAt(0)).toContain("new Event('input'")
    expect(jsAt(0)).toContain("new Event('change'")
  })

  it('presses a key with keydown, keypress, keyup and submits the form on Enter', async () => {
    await run([{ id: '1', kind: 'pressKey', element: el, key: 'Enter' }])
    const js = jsAt(0)
    expect(js).toContain(`key: ${JSON.stringify('Enter')}`)
    for (const type of ['keydown', 'keypress', 'keyup']) {
      expect(js).toContain(`new KeyboardEvent('${type}'`)
    }
    expect(js).toContain('el.form.requestSubmit()')
    expect(js).toContain('notCancelled')
  })

  it('maps legacy key names to DOM keys', async () => {
    await run([{ id: '1', kind: 'pressKey', element: el, key: 'return' }])
    expect(jsAt(0)).toContain(`key: ${JSON.stringify('Enter')}`)
  })

  it('waits for an element that appears on the 3rd poll', async () => {
    mockExecuteJavaScript
      .mockResolvedValueOnce({ found: false })
      .mockResolvedValueOnce({ found: false })
      .mockResolvedValueOnce({ found: true })
    const result = await run([{ id: '1', kind: 'click', element: el }])
    expect(mockExecuteJavaScript).toHaveBeenCalledTimes(3)
    expect(result).toEqual({ success: true, skippedStepIds: [] })
  })

  it('fails with the step number, English description and failedStepId when never found', async () => {
    mockExecuteJavaScript.mockResolvedValue({ found: false })
    const result = await run([{ id: 'abc', kind: 'click', element: el }])
    expect(result).toEqual({
      success: false,
      error: 'Step 1 (Click "Login button"): element not found: css=#btn',
      failedStepId: 'abc',
      skippedStepIds: []
    })
    expect(appState.isReplayingInWebview).toBe(false)
  })

  it('wait steps poll until the element is visible', async () => {
    mockExecuteJavaScript
      .mockResolvedValueOnce({ found: true, visible: false })
      .mockResolvedValueOnce({ found: true, visible: true })
    const result = await run([{ id: '1', kind: 'wait', element: el, until: 'visible' }])
    expect(mockExecuteJavaScript).toHaveBeenCalledTimes(2)
    expect(result).toEqual({ success: true, skippedStepIds: [] })
  })

  it('wait hidden passes when the element is gone, and fails on timeout otherwise', async () => {
    mockExecuteJavaScript.mockResolvedValue({ found: false })
    expect(await run([{ id: '1', kind: 'wait', element: el, until: 'hidden' }])).toEqual({
      success: true,
      skippedStepIds: []
    })
    mockExecuteJavaScript.mockResolvedValue({ found: true, visible: true })
    const result = await run([{ id: '2', kind: 'wait', element: el, until: 'hidden' }])
    expect(result.success).toBe(false)
    expect(result.failedStepId).toBe('2')
  })

  it('wait enabled polls until enabled', async () => {
    mockExecuteJavaScript
      .mockResolvedValueOnce({ found: true, enabled: false })
      .mockResolvedValueOnce({ found: true, enabled: true })
    expect(await run([{ id: '1', kind: 'wait', element: el, until: 'enabled' }])).toEqual({
      success: true,
      skippedStepIds: []
    })
  })

  it('a mismatching assertion fails with expected/got and failedStepId', async () => {
    mockExecuteJavaScript.mockResolvedValue({ found: true, text: 'Goodbye' })
    const result = await run([
      { id: 'a1', kind: 'assert', check: 'textEquals', element: el, expected: 'Hello' }
    ])
    expect(result).toEqual({
      success: false,
      error:
        'Step 1 (Assert that "Login button" has text equal to "Hello"): expected Hello, got Goodbye',
      failedStepId: 'a1',
      skippedStepIds: []
    })
  })

  it('a matching assertion passes; page assertions read title and url', async () => {
    mockExecuteJavaScript.mockResolvedValue({ title: 'Home', url: 'https://x.test/home' })
    const result = await run([
      { id: '1', kind: 'assert', check: 'titleEquals', expected: 'Home' },
      { id: '2', kind: 'assert', check: 'urlIncludes', expected: '/home' }
    ])
    expect(result).toEqual({ success: true, skippedStepIds: [] })
  })

  it('assertions retry within the wait budget', async () => {
    mockExecuteJavaScript
      .mockResolvedValueOnce({ found: true, visible: false })
      .mockResolvedValueOnce({ found: true, visible: true })
    const result = await run([{ id: '1', kind: 'assert', check: 'displayed', element: el }])
    expect(result).toEqual({ success: true, skippedStepIds: [] })
  })

  it('notDisplayed fails with got displayed while the element stays visible', async () => {
    mockExecuteJavaScript.mockResolvedValue({ found: true, visible: true })
    const result = await run([{ id: '1', kind: 'assert', check: 'notDisplayed', element: el }])
    expect(result.error).toContain('expected not displayed, got displayed')
  })

  it('skips custom and switchFrame steps and reports them', async () => {
    const result = await run([
      { id: '1', kind: 'custom', code: 'puts 1' },
      { id: '2', kind: 'switchFrame', element: el }
    ])
    expect(mockExecuteJavaScript).not.toHaveBeenCalled()
    expect(mockSend).toHaveBeenCalledWith('replay-progress', {
      current: 1,
      total: 2,
      skipped: true
    })
    expect(mockSend).toHaveBeenCalledWith('replay-progress', {
      current: 2,
      total: 2,
      skipped: true
    })
    expect(result).toEqual({ success: true, skippedStepIds: ['1', '2'] })
  })

  it('still reports skipped steps when a later step fails', async () => {
    mockExecuteJavaScript.mockResolvedValue({ found: false })
    const result = await run([
      { id: 's', kind: 'custom', code: 'puts 1' },
      { id: 'c', kind: 'click', element: el }
    ])
    expect(result.success).toBe(false)
    expect(result.failedStepId).toBe('c')
    expect(result.skippedStepIds).toEqual(['s'])
  })

  it('sends replay-progress for executed steps', async () => {
    await run([{ id: '1', kind: 'click', element: el }])
    expect(mockSend).toHaveBeenCalledWith('replay-progress', { current: 1, total: 1 })
  })

  it('passes selectors and text containing quotes, backslashes and </script> safely', async () => {
    const nasty = "a[title='x\\y'] </script><script>alert(1)</script>"
    const target: ElementTarget = { strategy: 'css', value: nasty }
    await run([
      { id: '1', kind: 'click', element: target },
      { id: '2', kind: 'type', element: target, text: nasty },
      { id: '3', kind: 'assert', check: 'textEquals', element: target, expected: nasty }
    ])
    const literal = JSON.stringify(nasty)
    expect(jsAt(0)).toContain(`document.querySelector(${literal})`)
    expect(jsAt(1)).toContain(`setter.call(el, ${literal})`)
    expect(jsAt(2)).toContain(`document.querySelector(${literal})`)
    // The raw value never appears outside a JSON string literal
    expect(jsAt(0).split(literal).join('')).not.toContain('alert(1)')
  })

  it('uses id and xpath finders', async () => {
    await run([
      { id: '1', kind: 'click', element: { strategy: 'id', value: "it's" } },
      { id: '2', kind: 'click', element: { strategy: 'xpath', value: '//a[@x="1"]' } }
    ])
    expect(jsAt(0)).toContain(`document.getElementById(${JSON.stringify("it's")})`)
    expect(jsAt(1)).toContain(`document.evaluate(${JSON.stringify('//a[@x="1"]')}`)
  })

  it('reports a thrown page error as a step failure', async () => {
    mockExecuteJavaScript.mockRejectedValue(new Error('boom'))
    const result = await run([{ id: '1', kind: 'click', element: el }])
    expect(result).toMatchObject({ success: false, failedStepId: '1' })
    expect(result.error).toContain('boom')
    expect(appState.isReplayingInWebview).toBe(false)
  })

  it('sets isReplayingInWebview during the replay and clears it after', async () => {
    let during = false
    mockExecuteJavaScript.mockImplementation(async () => {
      during = appState.isReplayingInWebview
      return { found: true }
    })
    await run([{ id: '1', kind: 'click', element: el }])
    expect(during).toBe(true)
    expect(appState.isReplayingInWebview).toBe(false)
  })

  it('cancelWebviewReplay exits early with cancelled: true', async () => {
    mockExecuteJavaScript.mockImplementation(async () => {
      cancelWebviewReplay()
      return { found: true }
    })
    const result = await run([
      { id: '1', kind: 'click', element: el },
      { id: '2', kind: 'click', element: el }
    ])
    expect(result).toEqual({ success: false, cancelled: true })
    expect(mockExecuteJavaScript).toHaveBeenCalledTimes(1)
  })

  it('retries when the probe rejects or returns garbage, then succeeds', async () => {
    mockExecuteJavaScript
      .mockRejectedValueOnce(new Error('Execution context was destroyed'))
      .mockRejectedValueOnce(new Error('Execution context was destroyed'))
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ found: true })
    const result = await run([{ id: '1', kind: 'click', element: el }])
    expect(mockExecuteJavaScript).toHaveBeenCalledTimes(4)
    expect(result).toEqual({ success: true, skippedStepIds: [] })
  })

  it('reports the last probe error only after the budget runs out', async () => {
    mockExecuteJavaScript.mockRejectedValue(new Error('navigating'))
    const result = await run([{ id: '1', kind: 'click', element: el }])
    expect(result.success).toBe(false)
    expect(result.error).toContain('element not found: css=#btn (navigating)')
  })

  it('resets isReplayingInWebview when progress reporting throws', async () => {
    mockSend.mockImplementationOnce(() => {
      throw new Error('window destroyed')
    })
    // attach the rejection handler before advancing timers so the rejection is never unhandled
    const assertion = expect(replay([{ id: '1', kind: 'click', element: el }])).rejects.toThrow(
      'window destroyed'
    )
    await vi.runAllTimersAsync()
    await assertion
    expect(appState.isReplayingInWebview).toBe(false)
  })

  it('cancelling while polling for a missing element returns cancelled and resets the flag', async () => {
    mockExecuteJavaScript.mockImplementation(async () => {
      cancelWebviewReplay()
      return { found: false }
    })
    const result = await run([{ id: '1', kind: 'click', element: el }])
    expect(result).toEqual({ success: false, cancelled: true })
    expect(appState.isReplayingInWebview).toBe(false)
  })

  it('fails an unsupported assert check instead of passing', async () => {
    mockExecuteJavaScript.mockResolvedValue({ found: true })
    const result = await run([
      { id: '1', kind: 'assert', check: 'bogus', element: el } as unknown as Step
    ])
    expect(result.success).toBe(false)
    expect(result.error).toContain('unsupported check bogus')
  })

  it('leaks no did-stop-loading listener when the load timeout elapses', async () => {
    mockLoadURL.mockResolvedValue(undefined)
    const result = await run([{ id: '1', kind: 'navigate', url: 'https://example.com' }])
    expect(result).toEqual({ success: true, skippedStepIds: [] })
    expect(emitter.listenerCount('did-stop-loading')).toBe(0)
  })

  it('fails the step when loadURL rejects', async () => {
    mockLoadURL.mockRejectedValue(new Error('ERR_NAME_NOT_RESOLVED'))
    const result = await run([{ id: 'n', kind: 'navigate', url: 'https://nope.invalid' }])
    expect(result).toMatchObject({ success: false, failedStepId: 'n' })
    expect(result.error).toContain('ERR_NAME_NOT_RESOLVED')
    expect(emitter.listenerCount('did-stop-loading')).toBe(0)
  })
})
