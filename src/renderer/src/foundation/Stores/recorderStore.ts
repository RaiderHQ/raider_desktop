import { create } from 'zustand'
import type { Suite } from '@foundation/Types/suite'
import type { Test } from '@foundation/Types/test'

interface RecorderStore {
  suites: Suite[]
  activeSuiteId: string | null
  activeTest: Test | null
  isRecording: boolean
  isRunning: boolean
  showCode: boolean
  isOutputVisible: boolean

  setSuites: (suites: Suite[]) => void
  setActiveSuiteId: (id: string | null) => void
  setActiveTest: (test: Test | null) => void
  updateActiveTest: (updater: (prev: Test | null) => Test | null) => void
  setIsRecording: (value: boolean) => void
  setIsRunning: (value: boolean) => void
  setShowCode: (value: boolean) => void
  setIsOutputVisible: (value: boolean) => void

  activeSuite: () => Suite | undefined
}

const useRecorderStore = create<RecorderStore>((set, get) => ({
  suites: [],
  activeSuiteId: null,
  activeTest: null,
  isRecording: false,
  isRunning: false,
  showCode: false,
  isOutputVisible: false,

  setSuites: (suites) => set({ suites }),
  setActiveSuiteId: (id) => set({ activeSuiteId: id }),
  setActiveTest: (test) => set({ activeTest: test }),
  updateActiveTest: (updater) => set((state) => ({ activeTest: updater(state.activeTest) })),
  setIsRecording: (value) => set({ isRecording: value }),
  setIsRunning: (value) => set({ isRunning: value }),
  setShowCode: (value) => set({ showCode: value }),
  setIsOutputVisible: (value) => set({ isOutputVisible: value }),

  activeSuite: () => {
    const { suites, activeSuiteId } = get()
    return suites.find((s) => s.id === activeSuiteId)
  }
}))

export default useRecorderStore
