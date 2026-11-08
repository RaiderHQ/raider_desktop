import { describe, it, expect, beforeEach, vi } from 'vitest'
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

describe('rubyStore check answers (home page setup line)', () => {
  const api = {
    isRubyInstalled: vi.fn(),
    installGems: vi.fn(),
    runCommand: vi.fn()
  }
  beforeEach(() => {
    vi.clearAllMocks()
    // @ts-expect-error - Mocking window.api
    window.api = api
    api.runCommand.mockResolvedValue({ success: true, output: '4.0.1' })
    api.installGems.mockResolvedValue({ success: true })
    useRubyStore.setState({
      rubyCommand: null,
      rubyVersion: null,
      missingGems: [],
      gemPrefix: null,
      checked: false,
      checkFailed: false,
      rechecking: false
    })
  })

  const rbenv = 'eval "$(rbenv init -)" && rbenv shell 3.2.8 &&'

  it('keeps the prefix gem commands need when Ruby is ready (the command ends in ruby)', () => {
    useRubyStore.getState().applyCheck({
      success: true,
      rubyCommand: `${rbenv} ruby`,
      rubyVersion: '3.2.8'
    })
    expect(useRubyStore.getState().rubyCommand).toBe(`${rbenv} ruby`)
    expect(useRubyStore.getState().gemPrefix).toBe(rbenv)
    expect(useRubyStore.getState().checked).toBe(true)
  })

  it('a plain system ruby has an empty prefix', () => {
    useRubyStore.getState().applyCheck({ success: true, rubyCommand: 'ruby', rubyVersion: '3.3.0' })
    expect(useRubyStore.getState().gemPrefix).toBe('')
  })

  it('with gems missing the check answers the prefix itself, also when it is empty', () => {
    useRubyStore.getState().applyCheck({
      success: false,
      rubyCommand: '',
      rubyVersion: '3.3.0',
      missingGems: ['rspec']
    })
    expect(useRubyStore.getState().gemPrefix).toBe('')
    expect(useRubyStore.getState().missingGems).toEqual(['rspec'])
  })

  it('without Ruby there is no prefix', () => {
    useRubyStore.getState().applyCheck({ success: false })
    expect(useRubyStore.getState().gemPrefix).toBeNull()
    expect(useRubyStore.getState().checkFailed).toBe(false)
  })

  it('a check that threw is not the same as no Ruby', () => {
    useRubyStore.getState().applyCheck(null)
    expect(useRubyStore.getState().checked).toBe(true)
    expect(useRubyStore.getState().checkFailed).toBe(true)
  })

  it('recheck asks main again and reads the gem version again', async () => {
    api.isRubyInstalled.mockResolvedValue({
      success: true,
      rubyCommand: 'ruby',
      rubyVersion: '3.3.0'
    })
    const done = useRubyStore.getState().recheck()
    expect(useRubyStore.getState().rechecking).toBe(true)
    await done
    expect(useRubyStore.getState().rechecking).toBe(false)
    expect(useRubyStore.getState().rubyVersion).toBe('3.3.0')
    expect(api.runCommand).toHaveBeenCalledWith('raider version')
  })

  it('installGems runs gem install with the prefix, not the ruby command, then checks again', async () => {
    useRubyStore.getState().applyCheck({
      success: true,
      rubyCommand: `${rbenv} ruby`,
      rubyVersion: '3.2.8'
    })
    api.isRubyInstalled.mockResolvedValue({
      success: true,
      rubyCommand: `${rbenv} ruby`,
      rubyVersion: '3.2.8'
    })
    const done = useRubyStore.getState().installGems(['ruby_raider'])
    // Busy from the start, so a second Fix… cannot start a second install
    expect(useRubyStore.getState().rechecking).toBe(true)
    await done
    expect(api.installGems).toHaveBeenCalledWith(rbenv, ['ruby_raider'])
    expect(api.isRubyInstalled).toHaveBeenCalled()
    expect(useRubyStore.getState().rechecking).toBe(false)
  })
})
