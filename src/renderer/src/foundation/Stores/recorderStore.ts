import { create } from 'zustand'
import type { Test } from '@foundation/Types/test'
import type { CodeTestView } from '@shared/types/projectTest'
import type { TestRow } from '@foundation/testKey'

/** What a recording is for, which decides how Stop & save writes it. */
export type RecordingTarget =
  | { kind: 'test' }
  | { kind: 'draft' }
  | { kind: 'example'; file: string; exampleName: string }
  /** Picking a new element for one step: nothing is recorded, and the steps stay as they are */
  | { kind: 'pick'; stepId: string }

/** Why a recording over a code example wasn't written, and which recording it was */
export interface UnsavedExample {
  reason: 'notUnique' | 'error'
  exampleName: string
  testId: string
}

interface RecorderStore {
  activeTest: Test | null
  /** The active test is a saved one (not a new draft or a scratch recording): edits are saved back */
  activeTestSaved: boolean
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
  /** Set while recording: where Stop & save writes the recording */
  recordingTarget: RecordingTarget | null
  /** The embedded browser's page and preload script while recording (null otherwise) */
  recordingUrl: string | null
  preloadPath: string | null
  /** A new test named on the new-test page and not saved yet; its live steps are in `activeTest` */
  draftTest: Test | null
  /** A recording over a code example that couldn't be written into its file; its steps are in `activeTest` */
  unsavedExample: UnsavedExample | null
  /** The step (1-based) whose element is being picked on the page; null otherwise */
  pickingStep: number | null
  /** Picking an element to add a check for, while recording */
  assertPicking: boolean
  /** The recording guide was asked for (Show guide, Help menu) */
  guideOpen: boolean

  setActiveTestSaved: (saved: boolean) => void
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
  setRecordingTarget: (target: RecordingTarget | null) => void
  setRecordingBrowser: (browser: { url: string; preloadPath: string } | null) => void
  /** The test page should start the recorder as soon as the draft opens (quick record) */
  recordOnOpen: boolean
  /** Open a new, unsaved test with this name and start URL, ready to record */
  startDraft: (
    name: string,
    url: string,
    options?: { recordOnOpen?: boolean; kind?: 'test' | 'flow' }
  ) => void
  setRecordOnOpen: (value: boolean) => void
  setDraftTest: (test: Test | null) => void
  setUnsavedExample: (unsaved: UnsavedExample | null) => void
  setPickingStep: (step: number | null) => void
  setAssertPicking: (value: boolean) => void
  setGuideOpen: (value: boolean) => void
  /** Make the list row's recorded test the active one (throws when the project has no such test) */
  openTest: (row: TestRow) => Promise<void>
  /** Forget everything that belongs to the project that was open */
  resetForProject: () => void
}

const useRecorderStore = create<RecorderStore>((set) => ({
  activeTest: null,
  activeTestSaved: false,
  isRecording: false,
  isRunning: false,
  showCode: false,
  isOutputVisible: false,
  breakpointIndex: null,
  isReplayingToBreakpoint: false,
  failedStepId: null,
  readOnlyView: null,
  readOnlyTitle: null,
  recordingTarget: null,
  recordingUrl: null,
  preloadPath: null,
  draftTest: null,
  recordOnOpen: false,
  unsavedExample: null,
  pickingStep: null,
  assertPicking: false,
  guideOpen: false,

  setActiveTestSaved: (saved) => set({ activeTestSaved: saved }),
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
  setRecordingTarget: (target): void => set({ recordingTarget: target }),
  setRecordingBrowser: (browser): void =>
    set({ recordingUrl: browser?.url ?? null, preloadPath: browser?.preloadPath ?? null }),
  startDraft: (name, url, options): void => {
    const draft: Test = {
      id: crypto.randomUUID(),
      name,
      url,
      steps: [],
      // A new flow says so once; main keeps it a flow from its first save on
      ...(options?.kind === 'flow' && { kind: 'flow' as const })
    }
    set({
      draftTest: draft,
      recordOnOpen: options?.recordOnOpen ?? false,
      activeTest: draft,
      // A draft is saved once, when its recording stops: nothing autosaves it
      activeTestSaved: false,
      readOnlyView: null,
      readOnlyTitle: null
    })
  },
  setDraftTest: (test): void => set({ draftTest: test }),
  setUnsavedExample: (unsaved): void => set({ unsavedExample: unsaved }),
  setPickingStep: (step): void => set({ pickingStep: step }),
  setAssertPicking: (value): void => set({ assertPicking: value }),
  setGuideOpen: (value): void => set({ guideOpen: value }),
  openTest: async (row): Promise<void> => {
    const tests = await window.api.getTests()
    const test = row.testId ? tests.find((x) => x.id === row.testId) : undefined
    if (!test) throw new Error(`No saved test ${row.testId ?? row.file ?? ''}`)
    set({ readOnlyView: null, readOnlyTitle: null, activeTest: test, activeTestSaved: true })
  },
  setRecordOnOpen: (value): void => set({ recordOnOpen: value }),
  resetForProject: (): void =>
    set({
      recordOnOpen: false,
      activeTest: null,
      activeTestSaved: false,
      readOnlyView: null,
      readOnlyTitle: null,
      recordingTarget: null,
      recordingUrl: null,
      preloadPath: null,
      draftTest: null,
      unsavedExample: null,
      pickingStep: null,
      assertPicking: false,
      guideOpen: false,
      breakpointIndex: null,
      failedStepId: null,
      isReplayingToBreakpoint: false,
      // The new project's Recorder must not open with Record and Run locked
      isRecording: false,
      isRunning: false
    })
}))

export default useRecorderStore
