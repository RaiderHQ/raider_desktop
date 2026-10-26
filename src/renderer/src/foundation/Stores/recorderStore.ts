import { create } from 'zustand'
import type { Suite } from '@foundation/Types/suite'
import type { Test } from '@foundation/Types/test'
import type { CodeTestView } from '@shared/types/projectTest'

interface RecorderStore {
  suites: Suite[]
  activeSuiteId: string | null
  activeTest: Test | null
  isRecording: boolean
  isRunning: boolean
  showCode: boolean
  isOutputVisible: boolean
  breakpointIndex: number | null
  isReplayingToBreakpoint: boolean
  failedStepId: string | null
  /** A hand-written spec shown view-only; replaces the editable steps while set */
  readOnlyView: CodeTestView | null
  /** Friendly name of the test in `readOnlyView` */
  readOnlyTitle: string | null
  /** Test the Tests tab asked the Recorder to open once its suites have loaded */
  openTarget: { suiteId: string; testId: string } | null

  setSuites: (suites: Suite[]) => void
  setActiveSuiteId: (id: string | null) => void
  setActiveTest: (test: Test | null) => void
  updateActiveTest: (updater: (prev: Test | null) => Test | null) => void
  setIsRecording: (value: boolean) => void
  setIsRunning: (value: boolean) => void
  setShowCode: (value: boolean) => void
  setIsOutputVisible: (value: boolean) => void
  setBreakpointIndex: (index: number | null) => void
  setIsReplayingToBreakpoint: (value: boolean) => void
  setFailedStepId: (id: string | null) => void
  setReadOnlyView: (view: CodeTestView | null, title?: string | null) => void
  setOpenTarget: (target: { suiteId: string; testId: string } | null) => void

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
  breakpointIndex: null,
  isReplayingToBreakpoint: false,
  failedStepId: null,
  readOnlyView: null,
  readOnlyTitle: null,
  openTarget: null,

  setSuites: (suites) => set({ suites }),
  setActiveSuiteId: (id) => set({ activeSuiteId: id }),
  setActiveTest: (test) => set({ activeTest: test }),
  updateActiveTest: (updater) => set((state) => ({ activeTest: updater(state.activeTest) })),
  setIsRecording: (value) => set({ isRecording: value }),
  setIsRunning: (value) => set({ isRunning: value }),
  setShowCode: (value) => set({ showCode: value }),
  setIsOutputVisible: (value) => set({ isOutputVisible: value }),
  setBreakpointIndex: (index) => set({ breakpointIndex: index }),
  setIsReplayingToBreakpoint: (value) => set({ isReplayingToBreakpoint: value }),
  setFailedStepId: (id): void => set({ failedStepId: id }),
  setReadOnlyView: (view, title = null): void =>
    set({ readOnlyView: view, readOnlyTitle: view ? title : null }),
  setOpenTarget: (target): void => set({ openTarget: target }),

  activeSuite: () => {
    const { suites, activeSuiteId } = get()
    return suites.find((s) => s.id === activeSuiteId)
  }
}))

export default useRecorderStore
