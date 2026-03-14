import { describe, it, expect, beforeEach } from 'vitest'
import useRunOutputStore from '@foundation/Stores/runOutputStore'

describe('runOutputStore', () => {
  beforeEach(() => {
    useRunOutputStore.setState({ runOutput: '' })
  })

  it('initializes with empty run output', () => {
    expect(useRunOutputStore.getState().runOutput).toBe('')
  })

  it('sets run output', () => {
    useRunOutputStore.getState().setRunOutput('Test passed!')
    expect(useRunOutputStore.getState().runOutput).toBe('Test passed!')
  })

  it('overwrites previous output', () => {
    useRunOutputStore.getState().setRunOutput('first')
    useRunOutputStore.getState().setRunOutput('second')
    expect(useRunOutputStore.getState().runOutput).toBe('second')
  })

  it('clears output with empty string', () => {
    useRunOutputStore.getState().setRunOutput('some output')
    useRunOutputStore.getState().setRunOutput('')
    expect(useRunOutputStore.getState().runOutput).toBe('')
  })
})
