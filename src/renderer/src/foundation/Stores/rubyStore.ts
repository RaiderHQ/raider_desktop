import { create } from 'zustand'

interface RubyStore {
  rubyCommand: string | null
  rubyVersion: string | null
  versionWarning: string | null
  setRubyCommand: (command: string | null) => void
  setRubyVersion: (version: string | null) => void
  setVersionWarning: (warning: string | null) => void
}

const useRubyStore = create<RubyStore>(
  (set): RubyStore => ({
    rubyCommand: null,
    rubyVersion: null,
    versionWarning: null,
    setRubyCommand: (command: string | null): void => set({ rubyCommand: command }),
    setRubyVersion: (version: string | null): void => set({ rubyVersion: version }),
    setVersionWarning: (warning: string | null): void => set({ versionWarning: warning })
  })
)

export default useRubyStore
