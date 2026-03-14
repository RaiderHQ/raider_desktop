import { create } from 'zustand'

export interface VersionStore {
  version: string
  loadVersion: () => Promise<void>
}

const MIN_VERSION = '2.0.0'

const isVersionAtLeast = (version: string, minimum: string): boolean => {
  const [vMajor, vMinor, vPatch] = version.split('.').map(Number)
  const [mMajor, mMinor, mPatch] = minimum.split('.').map(Number)
  if (vMajor !== mMajor) return vMajor > mMajor
  if (vMinor !== mMinor) return vMinor > mMinor
  return vPatch >= mPatch
}

const useVersionStore = create<VersionStore>((set) => {
  const extractVersion = (input: string): string => {
    const match = input.match(/(\d+\.\d+\.\d+)/)
    if (!match) return MIN_VERSION
    return isVersionAtLeast(match[0], MIN_VERSION) ? match[0] : MIN_VERSION
  }

  const loadVersion = async (): Promise<void> => {
    try {
      const result = await window.api.runCommand('raider version')
      if (result.success) {
        set({ version: extractVersion(result.output) })
      } else {
        set({ version: MIN_VERSION })
      }
    } catch (error) {
      set({ version: MIN_VERSION })
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
    version: MIN_VERSION,
    loadVersion
  }
})

export default useVersionStore
