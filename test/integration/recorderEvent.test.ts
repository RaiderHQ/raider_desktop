import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSend = vi.fn()

vi.mock('../../src/main/handlers/appState', () => ({
  appState: {
    projectAutomation: null,
    isReplayingInWebview: false,
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

describe('toElementTarget', () => {
  it('caps a long text label at 60 characters', () => {
    const el = toElementTarget('css', '.x', { innerText: 'a'.repeat(100) })
    expect(el!.label).toHaveLength(60)
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
  })

  it('sends a structured click step, not Ruby, on a Watir project', () => {
    ;(appState as { projectAutomation: string | null }).projectAutomation = 'watir'

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
})
