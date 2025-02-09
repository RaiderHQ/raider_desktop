import { create } from 'zustand'

export interface VersionStore {
  version: string
  loadVersion: () => Promise<void>
}

const useVersionStore = create<VersionStore>((set) => ({
  version: '0.0.0',
  loadVersion: async (): Promise<void> => {
    const extractVersion = (input: string): string => {
      const match = input.match(/(\d+)\.(\d+)\.(\d+)/)
      return match ? match[0] : '0.0.0'
    }

    const result = await window.api.runCommand('raider version')
    if (!result.success) {
      return
    }

    set({ version: extractVersion(result.output) })
  }
}))

export default useVersionStore
