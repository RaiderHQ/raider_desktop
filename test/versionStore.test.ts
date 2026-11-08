import { describe, it, expect, vi, beforeEach } from 'vitest'

type VersionModule = typeof import('@foundation/Stores/versionStore')

const loadStore = async (): Promise<VersionModule> => import('@foundation/Stores/versionStore')

const mockRaider = (runCommand: ReturnType<typeof vi.fn>): void => {
  window.api = { runCommand } as unknown as typeof window.api
}

describe('versionStore', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('has no version before the gem has been read', async () => {
    mockRaider(
      vi.fn().mockResolvedValue({ success: true, output: 'The version is 4.0.0, happy testing!' })
    )

    const { default: useVersionStore } = await loadStore()

    expect(useVersionStore.getState().version).toBeNull()
  })

  it('extracts the version from the raider CLI output', async () => {
    mockRaider(
      vi.fn().mockResolvedValue({ success: true, output: 'The version is 4.0.0, happy testing!' })
    )

    const { default: useVersionStore } = await loadStore()
    await useVersionStore.getState().loadVersion()

    expect(useVersionStore.getState().version).toBe('4.0.0')
  })

  it('has no version when the CLI fails', async () => {
    mockRaider(vi.fn().mockResolvedValue({ success: false, output: 'command not found' }))

    const { default: useVersionStore } = await loadStore()
    await useVersionStore.getState().loadVersion()

    expect(useVersionStore.getState().version).toBeNull()
  })

  it('has no version when the IPC call throws', async () => {
    mockRaider(vi.fn().mockRejectedValue(new Error('IPC failed')))

    const { default: useVersionStore } = await loadStore()
    await useVersionStore.getState().loadVersion()

    expect(useVersionStore.getState().version).toBeNull()
  })

  it('has no version when the output holds no x.y.z', async () => {
    mockRaider(vi.fn().mockResolvedValue({ success: true, output: 'happy testing!' }))

    const { default: useVersionStore } = await loadStore()
    await useVersionStore.getState().loadVersion()

    expect(useVersionStore.getState().version).toBeNull()
  })

  it('forgets a version the next read cannot confirm', async () => {
    const runCommand = vi
      .fn()
      .mockResolvedValueOnce({ success: true, output: 'The version is 4.0.0' })
      .mockResolvedValueOnce({ success: false, output: '' })
    mockRaider(runCommand)

    const { default: useVersionStore } = await loadStore()
    await useVersionStore.getState().loadVersion()
    expect(useVersionStore.getState().version).toBe('4.0.0')
    await useVersionStore.getState().loadVersion()
    expect(useVersionStore.getState().version).toBeNull()
  })

  describe('supportsRuntime', () => {
    it.each([
      [null, false],
      ['3.15.2', false],
      ['4.0.0', true],
      ['4.1.0', true],
      ['10.0.0', true]
    ])('gem %s → %s', async (version, expected) => {
      const { supportsRuntime, RUNTIME_MIN_VERSION } = await loadStore()
      expect(RUNTIME_MIN_VERSION).toBe('4.0.0')
      expect(supportsRuntime(version)).toBe(expected)
    })
  })
})
