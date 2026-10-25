import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSend = vi.fn()
const mockCapturePage = vi.fn()

vi.mock('../../src/main/handlers/appState', () => ({
  appState: {
    projectAutomation: null,
    activeTraceDir: null,
    recorderWebContentsId: null,
    mainWindow: {
      webContents: {
        send: (...args: unknown[]): unknown => mockSend(...args)
      }
    }
  }
}))

vi.mock('electron', () => ({
  webContents: {
    fromId: (): { capturePage: () => unknown } => ({
      capturePage: (): unknown => mockCapturePage()
    })
  }
}))

import recorderEvent from '../../src/main/handlers/recording/recorderEvent'
import { appState } from '../../src/main/handlers/appState'

const state = appState as unknown as Record<string, unknown>

function getTraceStepCall(): unknown[] | undefined {
  return mockSend.mock.calls.find((c) => c[0] === 'new-trace-step')
}

describe('recorderEvent trace capture', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.projectAutomation = null
    state.activeTraceDir = null
    state.recorderWebContentsId = null
  })

  it('does not emit trace step when activeTraceDir is null', () => {
    recorderEvent({
      action: 'click',
      selector: '#btn',
      strategy: 'css',
      tagName: 'BUTTON'
    })

    expect(mockSend).toHaveBeenCalledWith('new-recorded-step', expect.any(Object))
    expect(getTraceStepCall()).toBeUndefined()
  })

  it('triggers screenshot capture when activeTraceDir is set', () => {
    state.activeTraceDir = '/tmp/trace-test'
    state.recorderWebContentsId = 42

    const fakeNativeImage = { toJPEG: (): Buffer => Buffer.from('fake-jpeg') }
    mockCapturePage.mockResolvedValue(fakeNativeImage)

    recorderEvent({
      action: 'click',
      selector: '#btn',
      strategy: 'css',
      tagName: 'BUTTON',
      pageUrl: 'https://example.com'
    })

    // The command should be sent immediately
    expect(mockSend).toHaveBeenCalledWith('new-recorded-step', expect.any(Object))
    // Screenshot capture should be triggered
    expect(mockCapturePage).toHaveBeenCalled()
  })

  it('emits trace step with element info on successful capture', async () => {
    state.activeTraceDir = '/tmp/trace-test'
    state.recorderWebContentsId = 42

    const fakeNativeImage = { toJPEG: (): Buffer => Buffer.from('fake-jpeg') }
    mockCapturePage.mockResolvedValue(fakeNativeImage)

    recorderEvent({
      action: 'click',
      selector: '#btn',
      strategy: 'css',
      tagName: 'BUTTON',
      pageUrl: 'https://example.com',
      innerText: 'Click me',
      boundingRect: { x: 10, y: 20, width: 100, height: 50 }
    })

    await vi.waitFor(() => {
      expect(getTraceStepCall()).toBeDefined()
    })

    const traceStep = getTraceStepCall()![1] as Record<string, unknown>
    expect(traceStep.id).toMatch(/^[0-9a-f-]+$/)
    expect(traceStep.command).toEqual(expect.any(String))
    expect(traceStep.url).toBe('https://example.com')
    expect(traceStep.timestamp).toEqual(expect.any(Number))

    const elementInfo = traceStep.elementInfo as Record<string, unknown>
    expect(elementInfo.tagName).toBe('BUTTON')
    expect(elementInfo.selector).toBe('#btn')
    expect(elementInfo.strategy).toBe('css')
    expect(elementInfo.innerText).toBe('Click me')
    expect(elementInfo.boundingRect).toEqual({ x: 10, y: 20, width: 100, height: 50 })
  })

  it('emits trace step without screenshot when capturePage fails', async () => {
    state.activeTraceDir = '/tmp/trace-test'
    state.recorderWebContentsId = 42

    mockCapturePage.mockRejectedValue(new Error('capture failed'))

    recorderEvent({
      action: 'click',
      selector: '.link',
      strategy: 'css',
      tagName: 'A',
      pageUrl: 'https://example.com/page'
    })

    await vi.waitFor(() => {
      expect(getTraceStepCall()).toBeDefined()
    })

    const traceStep = getTraceStepCall()![1] as Record<string, unknown>
    expect(traceStep.id).toMatch(/^[0-9a-f-]+$/)
    expect(traceStep.url).toBe('https://example.com/page')
    expect(traceStep.screenshotPath).toBeUndefined()

    const elementInfo = traceStep.elementInfo as Record<string, unknown>
    expect(elementInfo.tagName).toBe('A')
    expect(elementInfo.selector).toBe('.link')
    expect(elementInfo.strategy).toBe('css')
  })

  it('does not emit trace step when the event maps to no step', () => {
    state.activeTraceDir = '/tmp/trace-test'
    state.recorderWebContentsId = 42

    recorderEvent({
      action: 'sendKeys',
      selector: '#btn',
      strategy: 'css',
      tagName: 'BUTTON',
      value: 'UnknownKey'
    })

    expect(mockSend).not.toHaveBeenCalled()
    expect(mockCapturePage).not.toHaveBeenCalled()
  })

  it('does not trigger screenshot when recorderWebContentsId is null', () => {
    state.activeTraceDir = '/tmp/trace-test'
    state.recorderWebContentsId = null

    recorderEvent({
      action: 'click',
      selector: '#btn',
      strategy: 'css',
      tagName: 'BUTTON'
    })

    expect(mockSend).toHaveBeenCalledWith('new-recorded-step', expect.any(Object))
    expect(mockCapturePage).not.toHaveBeenCalled()
    expect(getTraceStepCall()).toBeUndefined()
  })

  it('links the trace step to the recorded step and renders it for Watir', async () => {
    state.projectAutomation = 'watir'
    state.activeTraceDir = '/tmp/trace-test'
    state.recorderWebContentsId = 42
    mockCapturePage.mockResolvedValue({ toJPEG: (): Buffer => Buffer.from('jpeg') })

    recorderEvent({ action: 'click', selector: 'go', strategy: 'id', tagName: 'BUTTON' })

    await vi.waitFor(() => {
      expect(getTraceStepCall()).toBeDefined()
    })

    const step = mockSend.mock.calls.find((c) => c[0] === 'new-recorded-step')![1]
    const traceStep = getTraceStepCall()![1] as Record<string, unknown>
    expect(traceStep.stepId).toBe(step.id)
    expect(traceStep.command).toBe("@browser.element(id: 'go').click")
  })

  it('renders Selenium Ruby for the trace command by default', async () => {
    state.activeTraceDir = '/tmp/trace-test'
    state.recorderWebContentsId = 42
    mockCapturePage.mockRejectedValue(new Error('no capture'))

    recorderEvent({ action: 'click', selector: 'go', strategy: 'id', tagName: 'BUTTON' })

    await vi.waitFor(() => {
      expect(getTraceStepCall()).toBeDefined()
    })

    const step = mockSend.mock.calls.find((c) => c[0] === 'new-recorded-step')![1]
    const traceStep = getTraceStepCall()![1] as Record<string, unknown>
    expect(traceStep.stepId).toBe(step.id)
    expect(traceStep.command).toContain("@driver.find_element(id: 'go').click")
  })

  it('includes element info in trace step for type action', async () => {
    state.activeTraceDir = '/tmp/trace-test'
    state.recorderWebContentsId = 42

    const fakeNativeImage = { toJPEG: (): Buffer => Buffer.from('jpeg') }
    mockCapturePage.mockResolvedValue(fakeNativeImage)

    recorderEvent({
      action: 'type',
      selector: '#email',
      strategy: 'id',
      tagName: 'INPUT',
      value: 'user@example.com',
      pageUrl: 'https://example.com/login',
      innerText: '',
      boundingRect: { x: 50, y: 100, width: 200, height: 30 }
    })

    await vi.waitFor(() => {
      expect(getTraceStepCall()).toBeDefined()
    })

    const traceStep = getTraceStepCall()![1] as Record<string, unknown>
    const elementInfo = traceStep.elementInfo as Record<string, unknown>
    expect(elementInfo.tagName).toBe('INPUT')
    expect(elementInfo.selector).toBe('#email')
    expect(elementInfo.strategy).toBe('id')
  })
})
