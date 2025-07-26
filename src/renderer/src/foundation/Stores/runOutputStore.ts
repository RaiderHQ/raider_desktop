import { create } from 'zustand'

interface RunOutputStore {
  runOutput: string
  setRunOutput: (output: string) => void
}

const useRunOutputStore = create<RunOutputStore>(
  (set): RunOutputStore => ({
    runOutput: '',
    setRunOutput: (output: string): void => set({ runOutput: output })
  })
)

export default useRunOutputStore
