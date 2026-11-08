import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSend = vi.fn()

vi.mock('../../src/main/handlers/appState', () => ({
  appState: {
    projectAutomation: null,
    isReplayingInWebview: false,
    pickMode: false,
    pickModeEndedAt: 0,
    mainWindow: {
      webContents: {
        send: (...args: unknown[]) => mockSend(...args)
      }
    }
  }
}))

import recorderEvent, {
  recorderEventToStep,
  toElementTarget
} from '../../src/main/handlers/recording/recorderEvent'
import { appState } from '../../src/main/handlers/appState'
import { isStep } from '../../src/shared/types/step'

const sentSteps = (): unknown[] =>
  mockSend.mock.calls.filter((c) => c[0] === 'new-recorded-step').map((c) => c[1])

describe('recorderEventToStep', () => {
  it('maps a click to a click step labelled by its text', () => {
    const step = recorderEventToStep({
      action: 'click',
      selector: 'login',
      strategy: 'id',
      tagName: 'BUTTON',
      innerText: '  Log in \n'
    })
    expect(step).toEqual({
      id: expect.any(String),
      kind: 'click',
      element: { strategy: 'id', value: 'login', label: 'Log in' }
    })
    expect(isStep(step)).toBe(true)
  })

  it('maps a change on an input to a type step labelled by its placeholder', () => {
    const step = recorderEventToStep({
      action: 'type',
      selector: '#email',
      strategy: 'css',
      tagName: 'INPUT',
      value: 'me@example.com',
      innerText: '',
      placeholder: 'Email address'
    })
    expect(step).toEqual({
      id: expect.any(String),
      kind: 'type',
      element: { strategy: 'css', value: '#email', label: 'Email address' },
      text: 'me@example.com'
    })
  })

  it('maps a change on a password field to a secret type step without its value', () => {
    const step = recorderEventToStep({
      action: 'type',
      selector: '#password',
      strategy: 'css',
      tagName: 'INPUT',
      secret: true,
      value: 'hunter2'
    })
    expect(step).toEqual({
      id: expect.any(String),
      kind: 'type',
      element: { strategy: 'css', value: '#password' },
      text: '',
      secret: true
    })
    expect(isStep(step)).toBe(true)
  })

  it('maps a change on a select to a type step with the selected value', () => {
    const step = recorderEventToStep({
      action: 'type',
      selector: 'country',
      strategy: 'id',
      tagName: 'SELECT',
      value: 'fr',
      ariaLabel: 'Country'
    })
    expect(step).toMatchObject({ kind: 'type', text: 'fr', element: { label: 'Country' } })
  })

  it('maps a recordable keydown to a pressKey step', () => {
    const step = recorderEventToStep({
      action: 'sendKeys',
      selector: '//input[1]',
      strategy: 'xpath',
      tagName: 'INPUT',
      value: 'Enter'
    })
    expect(step).toEqual({
      id: expect.any(String),
      kind: 'pressKey',
      element: { strategy: 'xpath', value: '//input[1]' },
      key: 'Enter'
    })
  })

  it('ignores keys that are not recordable', () => {
    expect(
      recorderEventToStep({
        action: 'sendKeys',
        selector: '#a',
        strategy: 'css',
        tagName: 'INPUT',
        value: 'UnknownKey'
      })
    ).toBeNull()
  })

  it('ignores elements without a usable selector', () => {
    expect(
      recorderEventToStep({ action: 'click', selector: '', strategy: '', tagName: 'DIV' })
    ).toBeNull()
  })

  it('ignores a change without a value', () => {
    expect(
      recorderEventToStep({ action: 'type', selector: '#a', strategy: 'css', tagName: 'INPUT' })
    ).toBeNull()
  })

  it('gives each step a fresh id', () => {
    const data = { action: 'click' as const, selector: '#a', strategy: 'css', tagName: 'A' }
    expect(recorderEventToStep(data)!.id).not.toBe(recorderEventToStep(data)!.id)
  })
})

describe('locator on recorder events', () => {
  const base = { action: 'click', selector: 'login', strategy: 'id', tagName: 'BUTTON' } as const

  it('keeps a valid locator on the step element', () => {
    const locator = { by: 'role', role: 'button', name: 'Log in' }
    const step = recorderEventToStep({ ...base, locator })
    expect(step).toMatchObject({
      kind: 'click',
      element: { strategy: 'id', value: 'login', locator }
    })
    expect(isStep(step)).toBe(true)
  })

  it('drops an invalid locator and keeps the step valid', () => {
    const step = recorderEventToStep({ ...base, locator: { by: 'role', role: 'button' } })
    expect(step).toEqual({
      id: expect.any(String),
      kind: 'click',
      element: { strategy: 'id', value: 'login' }
    })
    expect(isStep(step)).toBe(true)
  })
})

describe('toElementTarget', () => {
  it('cuts a long text label on a word boundary with an ellipsis, within 60 characters', () => {
    const text = 'Save Email Summer sale Pricing Report A Delete Report B Delete Report C and more'
    const el = toElementTarget('css', '.x', { innerText: text })
    expect(el!.label!.length).toBeLessThanOrEqual(60)
    expect(el!.label).toMatch(/\S…$/)
    expect(el!.label).toBe('Save Email Summer sale Pricing Report A Delete Report B…')
  })

  it('cuts inside a single long word rather than drop the whole label', () => {
    const el = toElementTarget('css', '.x', { innerText: 'x'.repeat(100) })
    expect(el!.label).toBe('x'.repeat(59) + '…')
  })

  it('uses a space at the limit itself as the boundary', () => {
    const text = 'a'.repeat(59) + ' ' + 'b'.repeat(20)
    expect(toElementTarget('css', '.x', { innerText: text })!.label).toBe('a'.repeat(59) + '…')
  })

  it('does not leave punctuation before the ellipsis', () => {
    const text = 'Terms and conditions, privacy policy, cookies and tracking, and more besides'
    expect(toElementTarget('css', '.x', { innerText: text })!.label).toBe(
      'Terms and conditions, privacy policy, cookies and tracking…'
    )
  })

  it('shortens an aria-label and a placeholder the same way', () => {
    const long = 'word '.repeat(20).trim()
    expect(toElementTarget('css', '.x', { ariaLabel: long })!.label!.length).toBeLessThanOrEqual(60)
    expect(toElementTarget('css', '.x', { placeholder: long })!.label).toMatch(/…$/)
  })

  it('names a region click by nothing when the preload sends no text', () => {
    expect(toElementTarget('css', 'main > div', { innerText: '' })!.label).toBeUndefined()
  })

  it('keeps the region flag only when the preload sends exactly true (R4)', () => {
    expect(toElementTarget('css', 'main > div', { region: true })).toEqual({
      strategy: 'css',
      value: 'main > div',
      region: true
    })
    expect(toElementTarget('css', '.x', { region: false })).toEqual({
      strategy: 'css',
      value: '.x'
    })
    expect(toElementTarget('css', '.x', { region: 'true' })).toEqual({
      strategy: 'css',
      value: '.x'
    })
    expect(toElementTarget('css', '.x', { region: 1 })).toEqual({
      strategy: 'css',
      value: '.x'
    })
  })

  it('carries the region flag from a click event onto the step', () => {
    const step = recorderEventToStep({
      action: 'click',
      selector: 'main > div',
      strategy: 'css',
      tagName: 'DIV',
      innerText: '',
      region: true
    })
    expect(step).toEqual({
      id: expect.any(String),
      kind: 'click',
      element: { strategy: 'css', value: 'main > div', region: true }
    })
    expect(isStep(step)).toBe(true)
  })

  it('keeps a label of exactly 60 characters whole', () => {
    const el = toElementTarget('css', '.x', { innerText: 'y'.repeat(60) })
    expect(el!.label).toBe('y'.repeat(60))
  })

  it('collapses whitespace in the label', () => {
    expect(toElementTarget('css', '.x', { innerText: 'Sign\n\n   up' })!.label).toBe('Sign up')
  })

  it('falls back to aria-label, then placeholder', () => {
    expect(toElementTarget('css', '.x', { innerText: ' ', ariaLabel: 'Close' })!.label).toBe(
      'Close'
    )
    expect(toElementTarget('css', '.x', { placeholder: 'Search' })!.label).toBe('Search')
  })

  it('omits the label when nothing describes the element', () => {
    expect(toElementTarget('css', '.x', {})).toEqual({ strategy: 'css', value: '.x' })
  })

  it('rejects unknown strategies', () => {
    expect(toElementTarget('name', 'q', {})).toBeNull()
  })
})

describe('recorderEvent handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(appState as { projectAutomation: string | null }).projectAutomation = null
    appState.isReplayingInWebview = false
    appState.pickMode = false
    appState.pickModeEndedAt = 0
  })

  it('sends a structured click step, not Ruby', () => {
    recorderEvent({ action: 'click', selector: 'myId', strategy: 'id', tagName: 'INPUT' })

    expect(sentSteps()).toEqual([
      { id: expect.any(String), kind: 'click', element: { strategy: 'id', value: 'myId' } }
    ])
    expect(mockSend).not.toHaveBeenCalledWith('new-recorded-command', expect.anything())
  })

  it('sends a type step with the typed value', () => {
    recorderEvent({
      action: 'type',
      selector: '#input',
      strategy: 'css',
      tagName: 'INPUT',
      value: 'hello world'
    })

    expect(sentSteps()).toEqual([expect.objectContaining({ kind: 'type', text: 'hello world' })])
  })

  it('never sends the value of a secret field to the app window', () => {
    recorderEvent({
      action: 'type',
      selector: '#password',
      strategy: 'css',
      tagName: 'INPUT',
      secret: true,
      value: 'hunter2'
    })

    expect(sentSteps()).toEqual([expect.objectContaining({ kind: 'type', secret: true })])
    expect(JSON.stringify(mockSend.mock.calls)).not.toContain('hunter2')
  })

  it('does not send when the key is not recordable', () => {
    recorderEvent({
      action: 'sendKeys',
      selector: '#btn',
      strategy: 'css',
      tagName: 'BUTTON',
      value: 'UnknownKey'
    })

    expect(mockSend).not.toHaveBeenCalled()
  })

  it('does not send events while isReplayingInWebview is true', () => {
    appState.isReplayingInWebview = true

    recorderEvent({ action: 'click', selector: '#btn', strategy: 'css', tagName: 'BUTTON' })

    expect(mockSend).not.toHaveBeenCalled()
  })

  it('resumes sending events after isReplayingInWebview is set back to false', () => {
    appState.isReplayingInWebview = false

    recorderEvent({ action: 'click', selector: '#btn', strategy: 'css', tagName: 'BUTTON' })

    expect(sentSteps()).toHaveLength(1)
  })

  it('drops every event while picking an element', () => {
    appState.pickMode = true

    recorderEvent({ action: 'click', selector: '#btn', strategy: 'css', tagName: 'BUTTON' })
    recorderEvent({
      action: 'sendKeys',
      selector: '#btn',
      strategy: 'css',
      tagName: 'BUTTON',
      value: 'Escape'
    })

    expect(mockSend).not.toHaveBeenCalled()
  })

  it('drops clicks for a moment after pick mode ends, then records again', () => {
    vi.useFakeTimers()
    appState.pickModeEndedAt = Date.now()

    vi.advanceTimersByTime(300)
    recorderEvent({ action: 'click', selector: '#btn', strategy: 'css', tagName: 'BUTTON' })
    expect(mockSend).not.toHaveBeenCalled()

    vi.advanceTimersByTime(300)
    recorderEvent({ action: 'click', selector: '#btn', strategy: 'css', tagName: 'BUTTON' })
    expect(sentSteps()).toHaveLength(1)
    vi.useRealTimers()
  })
})
