import { create } from 'zustand'

interface RunOutputStore {
  runOutput: string
  /** The last finished run failed, even if its output reads like a pass (e.g. a load error) */
  runFailed: boolean
  setRunOutput: (output: string) => void
  setRunResult: (output: string, success: boolean) => void
}

const useRunOutputStore = create<RunOutputStore>(
  (set): RunOutputStore => ({
    runOutput: '',
    runFailed: false,
    setRunOutput: (output: string): void => set({ runOutput: output, runFailed: false }),
    setRunResult: (output: string, success: boolean): void =>
      set({ runOutput: output, runFailed: !success })
  })
)

export default useRunOutputStore
