import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import useRecorderStore from '@foundation/Stores/recorderStore'
import type { RecordingTarget } from '@foundation/Stores/recorderStore'
import useProjectStore from '@foundation/Stores/projectStore'
import useRubyStore from '@foundation/Stores/rubyStore'
import useRunOutputStore from '@foundation/Stores/runOutputStore'
import { useTestsListStore } from '@foundation/Stores/testsListStore'
import { handleSaveResult } from '@foundation/saveResult'
import { testKeyOf, toRouteParam } from '@foundation/testKey'
import type { TestKey } from '@foundation/testKey'
import type { Test } from '@foundation/Types/test'
import type { PendingAssertion } from '@shared/types/pendingAssertion'
import { UNLISTED_SUITE_ID } from '@shared/types/suite'
import { useSuiteSync } from './useSuiteSync'
import { traceSavedOnStop, useRecordingIPC } from './useRecordingIPC'

export interface TestRecording {
  /** Record from the test's start URL, replacing its steps */
  start(target: RecordingTarget): Promise<void>
  /** Replay every step, then record after the last one */
  continueRecording(target: RecordingTarget): Promise<void>
  /** Replay up to `index`, then record after it */
  recordFromHere(index: number, target: RecordingTarget): Promise<void>
  /** Stop & save: save the recording to its target, then show the saved test */
  stop(): Promise<void>
  /** Stop and save the recording (or replay) without showing anything: the user is leaving */
  leave(): Promise<void>
  /** Saves a recording over a code example that its file couldn't take as a new recorded test */
  saveAsNewTest(): Promise<void>
  run(): Promise<void>
  cancelReplay(): Promise<void>
  recordingUrl: string | null
  preloadPath: string | null
  isRecording: boolean
  /** A text check waiting for its expected text */
  assertionInfo: PendingAssertion | null
  setAssertionInfo(info: PendingAssertion | null): void
}

const store = useRecorderStore.getState

type Translate = (key: string, options?: Record<string, string>) => string

/** Recording, or replaying up to a step before recording */
const isBusy = (): boolean => {
  const { recordingTarget, isRecording, isReplayingToBreakpoint } = store()
  return recordingTarget !== null || isRecording || isReplayingToBreakpoint
}

/** Saves the recorded trace, if any; returns the test marked as having one when it saved */
async function saveTraceOf(test: Test): Promise<Test> {
  if (!test.trace?.length) return test
  try {
    const result = await window.api.saveTrace(test.id, test.trace)
    if (!result.success) return test
  } catch (error) {
    console.error('Saving the trace failed:', error)
    return test
  }
  // Mark the test as it is now, if it is still open
  store().updateActiveTest((live) =>
    live && live.id === test.id ? { ...live, hasTrace: true } : live
  )
  return { ...test, hasTrace: true }
}

/** The recording started for `target` was left (saved or dropped) while it was starting */
const leftDuringStart = (target: RecordingTarget): boolean => store().recordingTarget !== target

// Why a recording didn't start: no address at all, or one the recorder can't open
const startFailedKey = (result: { reason?: 'unsupportedUrl' }): string =>
  result.reason === 'unsupportedUrl' ? 'recorder.unsupportedUrl' : 'recorder.noStartUrl'

/** Stops a recording main started after the user left it, unless another one took its place */
function stopAbandonedRecording(): void {
  if (store().recordingTarget === null) window.api.stopRecordingMain()
}

/** Only the start page was recorded: there is nothing worth keeping */
export const isEmptyRecording = (test: Test): boolean =>
  test.steps.length === 0 || (test.steps.length === 1 && test.steps[0].kind === 'navigate')

/** The draft as it is now: its steps live on the active test while it is open */
export const currentDraft = (): Test | null => {
  const { draftTest, activeTest } = store()
  if (!draftTest) return null
  return activeTest && activeTest.id === draftTest.id ? activeTest : draftTest
}

/** Forgets a new test nothing was recorded for (never saved). Does nothing while busy. */
export function dropEmptyDraft(): void {
  const { isRecording, isReplayingToBreakpoint, recordingTarget, activeTest } = store()
  const draft = currentDraft()
  if (!draft || isRecording || isReplayingToBreakpoint || recordingTarget) return
  if (!isEmptyRecording(draft)) return
  store().setDraftTest(null)
  if (activeTest?.id === draft.id) store().setActiveTest(null)
}

interface StopOptions {
  /** Called with the saved test's key once the save went through */
  onSaved?: (key: TestKey) => void
  /** Called when a new test was dropped because nothing was recorded */
  onDiscarded?: () => void
  /**
   * Someone is there to offer Save as a new test when a recording over a code example
   * can't be written into its file. Without it (leaving), it is saved as a new test at once
   */
  offerSaveAsNew?: boolean
  /** The user is leaving: nothing recorded stays on screen */
  leaving?: boolean
}

/**
 * Saves a stopped recording of `test` (and its trace) into the suite, says where it
 * went, and refreshes the list. Returns true when it saved.
 */
async function saveStopped(
  t: Translate,
  suiteId: string,
  test: Test,
  { onSaved, leaving }: StopOptions
): Promise<boolean> {
  // The trace is saved here, from the same snapshot: after a leave, nothing is left
  // listening for main's 'recording-stopped'
  traceSavedOnStop()
  const withTrace = await saveTraceOf(test)
  let result: Awaited<ReturnType<typeof window.api.saveRecording>>
  try {
    result = await window.api.saveRecording(suiteId, withTrace)
  } catch (error) {
    console.error('Saving the test failed:', error)
    toast.error(t('recorder.saveFailed'), { id: 'save-failed' })
    return false
  }
  if (!handleSaveResult(result, test.id, t)) {
    // Say what became of the steps, so nobody wonders whether it saved
    if (result?.error === 'codeOwned') {
      toast.error(t(leaving ? 'tests.saveRefusedCodeOwnedOnLeave' : 'tests.saveRefusedCodeOwned'))
    }
    return false
  }
  const name = result?.test?.name ?? test.name
  const file = result?.test?.file
  toast.success(file ? t('tests.saved', { name, file }) : t('tests.savedNoFile', { name }))
  // A new file changes the list (and gives the test its row)
  await useTestsListStore.getState().reload()
  onSaved?.(testKeyOf({ name: test.name, testId: test.id, ownership: 'recorded', suiteIds: [] }))
  return true
}

type RecordOverResult = Awaited<ReturnType<typeof window.api.recordOverExample>>

/**
 * Writes a stopped recording over the code example it was bound to. When the file
 * can't take it, the steps stay in `activeTest`: offered as a new test, or saved as one.
 */
async function saveOverExample(
  t: Translate,
  target: { file: string; exampleName: string },
  test: Test | null,
  options: StopOptions
): Promise<void> {
  // A trace of this recording is only kept if it becomes a test of its own
  traceSavedOnStop()
  // Nothing recorded must not wipe the example
  if (!test || isEmptyRecording(test)) {
    if (test && store().activeTest?.id === test.id) store().setActiveTest(null)
    return
  }
  const rubyCommand = useRubyStore.getState().rubyCommand ?? ''
  let result: RecordOverResult
  try {
    result = await window.api.recordOverExample(
      target.file,
      target.exampleName,
      test.steps,
      rubyCommand
    )
  } catch (error) {
    console.error('Recording over the example failed:', error)
    result = { success: false, error: error instanceof Error ? error.message : String(error) }
  }
  if (result.success) {
    toast.success(t('tests.saved', { name: target.exampleName, file: target.file }))
    if (store().activeTest?.id === test.id) store().setActiveTest(null)
    await useTestsListStore.getState().reload()
    return
  }
  const notUnique = result.error === 'notUnique'
  if (options.offerSaveAsNew) {
    if (!notUnique) toast.error(t('testPage.recordOverFailed', { error: result.error }))
    store().setUnsavedExample({
      reason: notUnique ? 'notUnique' : 'error',
      exampleName: target.exampleName,
      testId: test.id
    })
    return
  }
  // Leaving: nobody is left to offer Save as a new test, so nothing recorded is lost.
  // Only how that save went is said
  await saveStopped(t, UNLISTED_SUITE_ID, test, options)
}

/**
 * Leaving with a recording over a code example on screen that its file refused: it is
 * saved as a new test, since nobody is left to offer that.
 */
let savingUnsavedFor: string | null = null
async function saveUnsavedExample(t: Translate): Promise<void> {
  const { unsavedExample: unsaved, activeTest: test } = store()
  // Once: a leave and a window-close flush can both ask
  if (!unsaved || savingUnsavedFor === unsaved.testId) return
  if (!test || test.id !== unsaved.testId) {
    store().setUnsavedExample(null)
    return
  }
  savingUnsavedFor = unsaved.testId
  try {
    // Forgotten only once saved: a failed save keeps the steps
    const saved = await saveStopped(t, UNLISTED_SUITE_ID, test, { leaving: true })
    if (saved && store().unsavedExample?.testId === unsaved.testId) store().setUnsavedExample(null)
  } finally {
    savingUnsavedFor = null
  }
}

/** The user is leaving: saves whatever is recording, or recorded and not saved yet */
function saveOnLeave(t: Translate): Promise<void> {
  return isBusy() ? stopAndSave(t, { leaving: true }) : saveUnsavedExample(t)
}

/**
 * Ends the recording (and any replay) and saves it to its target. The test is read
 * from the store when called, so later events can't change what is saved.
 */
async function stopAndSave(t: Translate, options: StopOptions = {}): Promise<void> {
  const { recordingTarget: target, activeSuiteId, activeTest: test, draftTest } = store()
  if (store().isReplayingToBreakpoint) {
    Promise.resolve(window.api.cancelReplay()).catch((error: unknown) =>
      console.error('Cancelling the replay failed:', error)
    )
    store().setIsReplayingToBreakpoint(false)
    store().setBreakpointIndex(null)
  }
  store().setRecordingBrowser(null)
  // Right away, not on main's 'recording-stopped': steps still in flight must not land anywhere
  store().setIsRecording(false)
  window.api.stopRecordingMain()
  store().setRecordingTarget(null)
  if (!target) return
  switch (target.kind) {
    case 'test': {
      if (!activeSuiteId || !test) return
      await saveStopped(t, activeSuiteId, test, options)
      return
    }
    case 'draft': {
      const draft = test && draftTest && test.id === draftTest.id ? test : null
      if (!draft || isEmptyRecording(draft)) {
        // Nothing is written for it, its trace included
        traceSavedOnStop()
        store().setDraftTest(null)
        options.onDiscarded?.()
        return
      }
      if (await saveStopped(t, target.suiteId, draft, options)) {
        // Saved: from now on it is a recorded test like any other
        if (store().draftTest?.id === draft.id) store().setDraftTest(null)
      }
      return
    }
    case 'example':
      await saveOverExample(t, target, test, options)
      return
    default: {
      const unknownTarget: never = target
      throw new Error(`Unknown recording target ${JSON.stringify(unknownTarget)}`)
    }
  }
}

/**
 * Recording, replay and running for the open test. Mount it once per workspace:
 * it also keeps the suites in sync and listens to the recording IPC.
 */
export function useTestRecording(): TestRecording {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const recordingUrl = useRecorderStore((s) => s.recordingUrl)
  const preloadPath = useRecorderStore((s) => s.preloadPath)
  const isRecording = useRecorderStore((s) => s.isRecording)
  const hasUnsavedExample = useRecorderStore((s) => s.unsavedExample !== null)
  const activeTest = useRecorderStore((s) => s.activeTest)
  const [assertionInfo, setAssertionInfo] = useState<PendingAssertion | null>(null)

  useSuiteSync()
  useRecordingIPC({ setAssertionInfo })

  const stop = useCallback(
    (): Promise<void> =>
      stopAndSave(t, {
        onSaved: (key) => navigate(`/overview/tests/${toRouteParam(key)}`),
        onDiscarded: () => navigate('/overview/tests'),
        offerSaveAsNew: true
      }),
    [t, navigate]
  )

  const leave = useCallback((): Promise<void> => saveOnLeave(t), [t])

  const saveAsNewTest = useCallback(async (): Promise<void> => {
    const { unsavedExample: unsaved, activeTest: test } = store()
    if (!unsaved || !test || test.id !== unsaved.testId) return
    const saved = await saveStopped(t, UNLISTED_SUITE_ID, test, {
      onSaved: (key) => navigate(`/overview/tests/${toRouteParam(key)}`)
    })
    if (saved && store().unsavedExample?.testId === unsaved.testId) store().setUnsavedExample(null)
  }, [t, navigate])

  // Main holds a window close while recording (or while steps wait to be saved), so
  // they are saved first
  useEffect(() => {
    window.api.setRecordingState(isRecording || hasUnsavedExample)
  }, [isRecording, hasUnsavedExample])

  useEffect(
    () =>
      window.api.onFlushRecording(() => {
        saveOnLeave(t)
          .catch((error: unknown) => console.error('Saving the recording failed:', error))
          .finally(() => window.api.flushRecordingDone())
      }),
    []
  )

  // Leaving the page while recording (or with steps not saved yet) saves them
  useEffect(
    () => (): void => {
      saveOnLeave(t).catch((error: unknown) => console.error('Saving the recording failed:', error))
      window.api.setRecordingState(false)
    },
    []
  )

  // Autosave: recorded tests are written back 500 ms after the last change. Not while
  // recording: Stop & save writes the test once, instead of every half-second. Opening a
  // test is not a change: nothing is written until it is edited
  const autosavedTestId = useRef<string | null>(activeTest?.id ?? null)
  useEffect((): (() => void) | void => {
    const opened = (activeTest?.id ?? null) !== autosavedTestId.current
    autosavedTestId.current = activeTest?.id ?? null
    if (opened || isBusy()) return
    const handler = setTimeout(() => {
      const { activeSuiteId: suiteId, activeTest: test, readOnlyView: view, draftTest } = store()
      if (isBusy()) return
      // Read-only tests are never written back
      if (view || (test?.ownership && test.ownership !== 'recorded')) return
      // A new test is written once, when its recording stops
      if (test && test.id === draftTest?.id) return
      if (suiteId && test) {
        window.api
          .saveRecording(suiteId, test)
          .then((result) => handleSaveResult(result, test.id, t))
          .catch((error: unknown) => console.error('Saving the test failed:', error))
      }
    }, 500)
    return () => clearTimeout(handler)
  }, [activeTest])

  const start = useCallback(async (target: RecordingTarget): Promise<void> => {
    if (useProjectStore.getState().layout?.recordable === false) return
    store().setUnsavedExample(null)
    if (target.kind === 'example') {
      // The recording IPC only appends to an active test; an empty URL means the project base URL
      store().setActiveTest({
        id: crypto.randomUUID(),
        name: target.exampleName,
        url: '',
        steps: []
      })
      // No suite lists it: nothing autosaves it, and suite updates leave it alone
      store().setActiveSuiteId(null)
    }
    const test = store().activeTest
    if (!test) return
    store().setRecordingTarget(target)
    // An empty URL clears any earlier one, so main falls back to the project base URL
    await window.api.loadUrlRequest(test.url ?? '')
    // The user may have left while this was starting: leaving already saved what there was
    if (leftDuringStart(target)) return
    const result = await window.api.startRecordingMain()
    if (leftDuringStart(target)) {
      if (result.success) stopAbandonedRecording()
      return
    }
    if (result.success) {
      store().setRecordingBrowser({ url: result.url, preloadPath: result.preloadPath })
    } else {
      store().setRecordingTarget(null)
      toast.error(t(startFailedKey(result)))
    }
  }, [])

  const recordFromHere = useCallback(
    async (index: number, target: RecordingTarget): Promise<void> => {
      const test = store().activeTest
      if (!test || useProjectStore.getState().layout?.recordable === false) return
      const { setBreakpointIndex, setFailedStepId, setIsReplayingToBreakpoint } = store()

      const stepsToReplay = test.steps.slice(0, index + 1)
      store().setRecordingTarget(target)
      setBreakpointIndex(index)
      setFailedStepId(null)
      setIsReplayingToBreakpoint(true)

      // Start recording to show the embedded webview immediately
      await window.api.loadUrlRequest(test.url ?? '')
      // The user may have left while this was starting: leaving already saved what there was
      if (leftDuringStart(target)) return
      const recResult = await window.api.startRecordingMain()
      if (leftDuringStart(target)) {
        if (recResult.success) stopAbandonedRecording()
        return
      }
      if (!recResult.success) {
        setIsReplayingToBreakpoint(false)
        setBreakpointIndex(null)
        store().setRecordingTarget(null)
        toast.error(t(startFailedKey(recResult)))
        return
      }
      store().setRecordingBrowser({ url: recResult.url, preloadPath: recResult.preloadPath })

      // Wait briefly for the webview to mount and register its webContentsId
      await new Promise((resolve) => setTimeout(resolve, 1500))
      if (leftDuringStart(target)) return

      // Replay steps directly in the embedded webview
      const result = await window.api.replayInWebview(stepsToReplay)
      if (result.cancelled || leftDuringStart(target)) return

      setIsReplayingToBreakpoint(false)
      if (!result.success) {
        setBreakpointIndex(null)
        setFailedStepId(result.failedStepId ?? null)
        toast.error(`${t('recorder.breakpoint.replayFailed')}: ${result.error ?? ''}`)
        return
      }
      // Replay can't run custom code or switch frames, so the page may not match the steps
      const skipped = result.skippedStepIds?.length ?? 0
      if (skipped > 0) {
        toast(t('recorder.breakpoint.skippedSteps', { count: skipped }), {
          icon: '⚠️',
          duration: 8000
        })
      }
    },
    []
  )

  const continueRecording = useCallback(
    async (target: RecordingTarget): Promise<void> => {
      const steps = store().activeTest?.steps ?? []
      await recordFromHere(steps.length - 1, target)
    },
    [recordFromHere]
  )

  const run = useCallback(async (): Promise<void> => {
    const { activeSuiteId: suiteId, activeTest: test, readOnlyView: view, setIsRunning } = store()
    const { setRunOutput, setRunResult } = useRunOutputStore.getState()
    const cmd = useRubyStore.getState().rubyCommand
    const path = useProjectStore.getState().projectPath
    // Tests that are code run straight from their file, never from a copy of the steps
    const codeFile =
      view?.file ?? (test?.ownership && test.ownership !== 'recorded' ? test.file : undefined)
    if (codeFile && !cmd) {
      setRunOutput(t('recorder.noRuby'))
      return
    }
    if (codeFile && cmd) {
      setIsRunning(true)
      setRunOutput(`Running test: ${view ? (store().readOnlyTitle ?? '') : (test?.name ?? '')}...`)
      try {
        const result = await window.api.runProjectFile(codeFile, cmd)
        setRunResult(result.output, result.success)
      } catch (error) {
        console.error('Running the test failed:', error)
        setRunResult(t('recorder.runFailed'), false)
      }
      setIsRunning(false)
      return
    }
    if (suiteId && test?.id && cmd) {
      setIsRunning(true)
      setRunOutput(`Running test: ${test.name}...`)
      // The test itself goes along, so a pending autosave can't make the run use older steps
      const result = await window.api.runTest(suiteId, test.id, path || '.', cmd, test)
      setRunResult(result.output, result.success)
      setIsRunning(false)
    }
  }, [])

  const cancelReplay = useCallback(async (): Promise<void> => {
    await window.api.cancelReplay()
    store().setIsReplayingToBreakpoint(false)
    store().setBreakpointIndex(null)
    store().setRecordingBrowser(null)
    store().setRecordingTarget(null)
    window.api.stopRecordingMain()
  }, [])

  return {
    start,
    continueRecording,
    recordFromHere,
    stop,
    leave,
    saveAsNewTest,
    run,
    cancelReplay,
    recordingUrl,
    preloadPath,
    isRecording,
    assertionInfo,
    setAssertionInfo
  }
}
