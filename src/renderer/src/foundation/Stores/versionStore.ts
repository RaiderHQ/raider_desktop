import { create } from 'zustand'

export interface VersionStore {
  version: string
  loadVersion: () => Promise<void>
}

const useVersionStore = create<VersionStore>((set) => {
  const extractVersion = (input: string): string => {
    const match = input.match(/(\d+\.\d+\.\d+)/)
    return match ? match[0] : '1.1.4'
  }

  const loadVersion = async (): Promise<void> => {
    try {
      const result = await window.api.runCommand('raider version')
      if (result.success) {
        set({ version: extractVersion(result.output) })
      } else {
        set({ version: '1.1.4' })
      }
    } catch (error) {
      set({ version: '1.1.4' })
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
    version: '1.1.4',
    loadVersion
  }
})

export default useVersionStore
