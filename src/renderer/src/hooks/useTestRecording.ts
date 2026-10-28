import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import useRecorderStore from '@foundation/Stores/recorderStore'
import type { RecordingTarget } from '@foundation/Stores/recorderStore'
import useProjectStore from '@foundation/Stores/projectStore'
import useRubyStore from '@foundation/Stores/rubyStore'
import useRunOutputStore from '@foundation/Stores/runOutputStore'
import { handleSaveResult } from '@foundation/saveResult'
import type { PendingAssertion } from '@shared/types/pendingAssertion'
import { useSuiteSync } from './useSuiteSync'
import { useRecordingIPC } from './useRecordingIPC'

export interface TestRecording {
  /** Record from the test's start URL, replacing its steps */
  start(target: RecordingTarget): Promise<void>
  /** Replay every step, then record after the last one */
  continueRecording(target: RecordingTarget): Promise<void>
  /** Replay up to `index`, then record after it */
  recordFromHere(index: number, target: RecordingTarget): Promise<void>
  /** Stop the recording and save it to its target */
  stop(): Promise<void>
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

/**
 * Recording, replay and running for the open test. Mount it once per workspace:
 * it also keeps the suites in sync and listens to the recording IPC.
 */
export function useTestRecording(): TestRecording {
  const { t } = useTranslation()
  const recordingUrl = useRecorderStore((s) => s.recordingUrl)
  const preloadPath = useRecorderStore((s) => s.preloadPath)
  const isRecording = useRecorderStore((s) => s.isRecording)
  const activeTest = useRecorderStore((s) => s.activeTest)
  const [assertionInfo, setAssertionInfo] = useState<PendingAssertion | null>(null)

  useSuiteSync()
  useRecordingIPC({ setAssertionInfo })

  const stop = useCallback(async (): Promise<void> => {
    const { recordingTarget: target, activeSuiteId, activeTest: test } = store()
    store().setRecordingBrowser(null)
    window.api.stopRecordingMain()
    store().setRecordingTarget(null)
    if (!target) return
    switch (target.kind) {
      case 'test': {
        if (!activeSuiteId || !test) return
        try {
          const result = await window.api.saveRecording(activeSuiteId, test)
          handleSaveResult(result, test.id, t)
        } catch (error) {
          console.error('Saving the test failed:', error)
        }
        return
      }
      case 'draft':
      case 'example':
        throw new Error(`Saving a ${target.kind} recording is not supported`)
      default: {
        const unknownTarget: never = target
        throw new Error(`Unknown recording target ${JSON.stringify(unknownTarget)}`)
      }
    }
  }, [t])

  // Autosave: recorded tests are written back 500 ms after the last change
  useEffect((): (() => void) => {
    const handler = setTimeout(() => {
      const { activeSuiteId: suiteId, activeTest: test, readOnlyView: view } = store()
      // Read-only tests are never written back
      if (view || (test?.ownership && test.ownership !== 'recorded')) return
      if (suiteId && test) {
        window.api
          .saveRecording(suiteId, test)
          .then((result) => {
            handleSaveResult(result, test.id, t)
            // A recording must not carry on into a test that is now read-only
            if (result?.error === 'codeOwned' && store().isRecording) {
              stop().catch((error: unknown) => console.error('Stopping failed:', error))
            }
          })
          .catch((error: unknown) => console.error('Saving the test failed:', error))
      }
    }, 500)
    return () => clearTimeout(handler)
  }, [activeTest])

  const start = useCallback(async (target: RecordingTarget): Promise<void> => {
    if (useProjectStore.getState().layout?.recordable === false) return
    if (target.kind === 'example') {
      // The recording IPC only appends to an active test; an empty URL means the project base URL
      store().setActiveTest({
        id: crypto.randomUUID(),
        name: target.exampleName,
        url: '',
        steps: []
      })
    }
    const test = store().activeTest
    if (!test) return
    store().setRecordingTarget(target)
    // An empty URL clears any earlier one, so main falls back to the project base URL
    await window.api.loadUrlRequest(test.url ?? '')
    const result = await window.api.startRecordingMain()
    if (result.success) {
      store().setRecordingBrowser({ url: result.url, preloadPath: result.preloadPath })
    } else {
      store().setRecordingTarget(null)
      toast.error(t('recorder.noStartUrl'))
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
      const recResult = await window.api.startRecordingMain()
      if (!recResult.success) {
        setIsReplayingToBreakpoint(false)
        setBreakpointIndex(null)
        store().setRecordingTarget(null)
        toast.error(t('recorder.noStartUrl'))
        return
      }
      store().setRecordingBrowser({ url: recResult.url, preloadPath: recResult.preloadPath })

      // Wait briefly for the webview to mount and register its webContentsId
      await new Promise((resolve) => setTimeout(resolve, 1500))

      // Replay steps directly in the embedded webview
      const result = await window.api.replayInWebview(stepsToReplay)
      if (result.cancelled) return

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
    run,
    cancelReplay,
    recordingUrl,
    preloadPath,
    isRecording,
    assertionInfo,
    setAssertionInfo
  }
}
