import { create } from 'zustand'

interface RunOutputStore {
  runOutput: string
  setRunOutput: (output: string) => void
}

const useRunOutputStore = create<RunOutputStore>((set) => ({
  runOutput: '',
  setRunOutput: (output) => set({ runOutput: output })
}))

export default useRunOutputStore
