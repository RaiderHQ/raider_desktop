import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('versionStore', () => {
  const EXPECTED_VERSION = '2.0.0'

  beforeEach(() => {
    vi.resetModules()
  })

  it('has the correct default version', async () => {
    // Mock window.api so the store doesn't make real IPC calls
    window.api = {
      runCommand: vi.fn().mockResolvedValue({
        success: true,
        output: `The version is ${EXPECTED_VERSION}, happy testing!`
      })
    } as unknown as typeof window.api

    const { default: useVersionStore } = await import(
      '@foundation/Stores/versionStore'
    )

    const state = useVersionStore.getState()
    expect(state.version).toBe(EXPECTED_VERSION)
  })

  it('extracts version from raider CLI output', async () => {
    window.api = {
      runCommand: vi.fn().mockResolvedValue({
        success: true,
        output: `The version is ${EXPECTED_VERSION}, happy testing!`
      })
    } as unknown as typeof window.api

    const { default: useVersionStore } = await import(
      '@foundation/Stores/versionStore'
    )

    await useVersionStore.getState().loadVersion()
    const state = useVersionStore.getState()
    expect(state.version).toBe(EXPECTED_VERSION)
  })

  it('falls back to expected version on CLI failure', async () => {
    window.api = {
      runCommand: vi.fn().mockResolvedValue({
        success: false,
        output: 'command not found'
      })
    } as unknown as typeof window.api

    const { default: useVersionStore } = await import(
      '@foundation/Stores/versionStore'
    )

    await useVersionStore.getState().loadVersion()
    const state = useVersionStore.getState()
    expect(state.version).toBe(EXPECTED_VERSION)
  })

  it('falls back to expected version on exception', async () => {
    window.api = {
      runCommand: vi.fn().mockRejectedValue(new Error('IPC failed'))
    } as unknown as typeof window.api

    const { default: useVersionStore } = await import(
      '@foundation/Stores/versionStore'
    )

    await useVersionStore.getState().loadVersion()
    const state = useVersionStore.getState()
    expect(state.version).toBe(EXPECTED_VERSION)
  })

  it('rejects version below 2.0.0 and falls back to minimum', async () => {
    window.api = {
      runCommand: vi.fn().mockResolvedValue({
        success: true,
        output: 'The version is 1.1.4, happy testing!'
      })
    } as unknown as typeof window.api

    const { default: useVersionStore } = await import(
      '@foundation/Stores/versionStore'
    )

    await useVersionStore.getState().loadVersion()
    const state = useVersionStore.getState()
    // Old versions below 2.0.0 should be rejected and overridden to minimum
    expect(state.version).toBe(EXPECTED_VERSION)
  })

  it('accepts version equal to 2.0.0', async () => {
    window.api = {
      runCommand: vi.fn().mockResolvedValue({
        success: true,
        output: 'The version is 2.0.0, happy testing!'
      })
    } as unknown as typeof window.api

    const { default: useVersionStore } = await import(
      '@foundation/Stores/versionStore'
    )

    await useVersionStore.getState().loadVersion()
    const state = useVersionStore.getState()
    expect(state.version).toBe('2.0.0')
  })

  it('accepts version above 2.0.0', async () => {
    window.api = {
      runCommand: vi.fn().mockResolvedValue({
        success: true,
        output: 'The version is 2.1.0, happy testing!'
      })
    } as unknown as typeof window.api

    const { default: useVersionStore } = await import(
      '@foundation/Stores/versionStore'
    )

    await useVersionStore.getState().loadVersion()
    const state = useVersionStore.getState()
    expect(state.version).toBe('2.1.0')
  })

  it('rejects version 1.9.9 as below minimum', async () => {
    window.api = {
      runCommand: vi.fn().mockResolvedValue({
        success: true,
        output: 'The version is 1.9.9, happy testing!'
      })
    } as unknown as typeof window.api

    const { default: useVersionStore } = await import(
      '@foundation/Stores/versionStore'
    )

    await useVersionStore.getState().loadVersion()
    const state = useVersionStore.getState()
    expect(state.version).toBe(EXPECTED_VERSION)
  })
})
