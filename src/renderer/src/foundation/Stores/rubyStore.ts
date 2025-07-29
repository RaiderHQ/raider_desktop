import { create } from 'zustand'

interface RubyStore {
  rubyCommand: string | null
  setRubyCommand: (command: string | null) => void
}

const useRubyStore = create<RubyStore>(
  (set): RubyStore => ({
    rubyCommand: null,
    setRubyCommand: (command: string | null): void => set({ rubyCommand: command })
  })
)

export default useRubyStore
