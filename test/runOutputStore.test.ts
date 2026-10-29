import { describe, it, expect, beforeEach } from 'vitest'
import useRunOutputStore from '@foundation/Stores/runOutputStore'

describe('runOutputStore', () => {
  beforeEach(() => {
    useRunOutputStore.setState({ runOutput: '', runFailed: false })
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

  it('remembers that a run failed', () => {
    useRunOutputStore.getState().setRunResult('0 examples, 0 failures, 1 error', false)
    expect(useRunOutputStore.getState().runOutput).toBe('0 examples, 0 failures, 1 error')
    expect(useRunOutputStore.getState().runFailed).toBe(true)
  })

  it('a new message clears the failed flag', () => {
    useRunOutputStore.getState().setRunResult('boom', false)
    useRunOutputStore.getState().setRunOutput('Running test: A...')
    expect(useRunOutputStore.getState().runFailed).toBe(false)
  })
})
