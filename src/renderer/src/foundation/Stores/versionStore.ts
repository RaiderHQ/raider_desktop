import { create } from 'zustand'

export interface VersionStore {
  version: string
  loadVersion: () => Promise<void>
}

const useVersionStore = create<VersionStore>((set) => {
  const extractVersion = (input: string): string => {
    const match = input.match(/(\d+\.\d+\.\d+)/)
    return match ? match[0] : '0.0.0'
  }

  const loadVersion = async (): Promise<void> => {
    try {
      const result = await window.api.runCommand('raider version')
      if (result.success) {
        set({ version: extractVersion(result.output) })
      } else {
        set({ version: '0.0.0' })
      }
    } catch (error) {
      set({ version: '0.0.0' })
    }
  }

  // A helper to wait until window.api is defined
  const waitForApi = async (): Promise<void> => {
    while (!window.api) {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }

  // Delay the version loading until window.api is available.
  setTimeout(async () => {
    await waitForApi()
    await loadVersion()
  })

  return {
    version: '0.0.0',
    loadVersion
  }
})

export default useVersionStore
