import { create } from 'zustand'

interface RubyStore {
  rubyCommand: string | null
  setRubyCommand: (command: string | null) => void
}

const useRubyStore = create<RubyStore>((set) => ({
  rubyCommand: null,
  setRubyCommand: (command) => set({ rubyCommand: command })
}))

export default useRubyStore
