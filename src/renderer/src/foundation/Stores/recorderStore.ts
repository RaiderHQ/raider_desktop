import { create } from 'zustand'
import type { Suite } from '@foundation/Types/suite'
import type { Test } from '@foundation/Types/test'
import type { CodeTestView } from '@shared/types/projectTest'
import type { TestRow } from '@foundation/testKey'

/** What a recording is for, which decides how Stop & save writes it. */
export type RecordingTarget =
  | { kind: 'test' }
  | { kind: 'draft'; suiteId: string }
  | { kind: 'example'; file: string; exampleName: string }

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
  /** Set while recording: where Stop & save writes the recording */
  recordingTarget: RecordingTarget | null
  /** The embedded browser's page and preload script while recording (null otherwise) */
  recordingUrl: string | null
  preloadPath: string | null

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
  setRecordingTarget: (target: RecordingTarget | null) => void
  setRecordingBrowser: (browser: { url: string; preloadPath: string } | null) => void
  /** Make the list row's recorded test the active one (throws when no suite lists it) */
  openTest: (row: TestRow) => Promise<void>
  /** Forget everything that belongs to the project that was open */
  resetForProject: () => void

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
  recordingTarget: null,
  recordingUrl: null,
  preloadPath: null,

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
  setRecordingTarget: (target): void => set({ recordingTarget: target }),
  setRecordingBrowser: (browser): void =>
    set({ recordingUrl: browser?.url ?? null, preloadPath: browser?.preloadPath ?? null }),
  openTest: async (row): Promise<void> => {
    const suites = await window.api.getSuites()
    const suite = row.testId
      ? suites.find((s) => s.tests.some((x) => x.id === row.testId))
      : undefined
    const test = suite?.tests.find((x) => x.id === row.testId)
    if (!suite || !test) throw new Error(`No suite lists test ${row.testId ?? row.file ?? ''}`)
    set({
      readOnlyView: null,
      readOnlyTitle: null,
      activeSuiteId: suite.id,
      activeTest: test,
      // useSuiteSync's first load must keep this test rather than pick the first suite's
      openTarget: { suiteId: suite.id, testId: test.id }
    })
  },
  resetForProject: (): void =>
    set({
      suites: [],
      activeSuiteId: null,
      activeTest: null,
      readOnlyView: null,
      readOnlyTitle: null,
      openTarget: null,
      recordingTarget: null,
      recordingUrl: null,
      preloadPath: null,
      breakpointIndex: null,
      failedStepId: null,
      isReplayingToBreakpoint: false,
      // The new project's Recorder must not open with Record and Run locked
      isRecording: false,
      isRunning: false
    }),

  activeSuite: () => {
    const { suites, activeSuiteId } = get()
    return suites.find((s) => s.id === activeSuiteId)
  }
}))

export default useRecorderStore
