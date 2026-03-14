import { describe, it, expect, beforeEach } from 'vitest'
import useRubyStore from '@foundation/Stores/rubyStore'

describe('rubyStore', () => {
  beforeEach(() => {
    useRubyStore.setState({ rubyCommand: null })
  })

  it('initializes with null ruby command', () => {
    expect(useRubyStore.getState().rubyCommand).toBeNull()
  })

  it('sets ruby command', () => {
    useRubyStore.getState().setRubyCommand('rbenv exec ruby')
    expect(useRubyStore.getState().rubyCommand).toBe('rbenv exec ruby')
  })

  it('clears ruby command with null', () => {
    useRubyStore.getState().setRubyCommand('ruby')
    useRubyStore.getState().setRubyCommand(null)
    expect(useRubyStore.getState().rubyCommand).toBeNull()
  })
})
