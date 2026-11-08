import { create } from 'zustand'

export interface VersionStore {
  /** The installed ruby_raider gem's version; null until read, or when `raider version` fails */
  version: string | null
  loadVersion: () => Promise<void>
}

/** New projects need the 4.0 runtime: `raider new` on an older gem writes 3.x helpers. */
export const RUNTIME_MIN_VERSION = '4.0.0'

export const isVersionAtLeast = (version: string, minimum: string): boolean => {
  const [vMajor, vMinor, vPatch] = version.split('.').map(Number)
  const [mMajor, mMinor, mPatch] = minimum.split('.').map(Number)
  if (vMajor !== mMajor) return vMajor > mMajor
  if (vMinor !== mMinor) return vMinor > mMinor
  return vPatch >= mPatch
}

/** True once the installed gem is known and is the 4.0 runtime or later. */
export const supportsRuntime = (version: string | null): boolean =>
  version !== null && isVersionAtLeast(version, RUNTIME_MIN_VERSION)

const useVersionStore = create<VersionStore>((set) => {
  const extractVersion = (input: string): string | null =>
    input.match(/(\d+\.\d+\.\d+)/)?.[1] ?? null

  const loadVersion = async (): Promise<void> => {
    try {
      const result = await window.api.runCommand('raider version')
      set({ version: result.success ? extractVersion(result.output) : null })
    } catch {
      set({ version: null })
    }
  }

  // Wait for window.api to be available, trying up to maxRetries times.
  const waitForApi = async (maxRetries = 20): Promise<void> => {
    let retries = maxRetries
    while (!window.api && retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, 50))
      retries--
    }
  }

  // Delay loading the version until window.api is ready.
  setTimeout(async () => {
    await waitForApi()
    await loadVersion()
  }, 0)

  return {
    version: null,
    loadVersion
  }
})

export default useVersionStore
