import { describe, it, expect, beforeEach } from 'vitest'
import { renderStepHandler } from '../../src/main/handlers/recording/renderStepHandler'
import { appState } from '../../src/main/handlers/appState'
import type { Step } from '../../src/shared/types/step'

const hours: Step = {
  id: 'h',
  kind: 'type',
  element: { strategy: 'css', value: '#hours' },
  text: '8',
  inputName: 'hours'
}

beforeEach(() => {
  appState.layout = null
})

describe('render-step', () => {
  it('renders a flow step through flow_input when asked for a flow', () => {
    expect(renderStepHandler(hours, { flow: true })).toContain("flow_input('hours', '8')")
  })

  it.each([
    ['no options', undefined],
    ['flow false', { flow: false }],
    ['flow "true" (a string)', { flow: 'true' }],
    ['flow 1', { flow: 1 }],
    ['an array', [true]],
    ['null', null]
  ])('renders plain typing with %s: only boolean true makes a flow', (_what, options) => {
    const ruby = renderStepHandler(hours, options)
    expect(ruby).not.toContain('flow_input')
    expect(ruby).toContain("send_keys('8')")
  })
})
