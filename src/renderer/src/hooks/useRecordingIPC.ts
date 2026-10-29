import { useEffect } from 'react'
import useRecorderStore from '@foundation/Stores/recorderStore'
import useRunOutputStore from '@foundation/Stores/runOutputStore'
import type { Test } from '@foundation/Types/test'
import type { TraceStep } from '@foundation/Types/traceStep'
import type { Step } from '@shared/types/step'
import { isPendingAssertion } from '@shared/types/pendingAssertion'
import type { AssertionMessage, PendingAssertion } from '@shared/types/pendingAssertion'

interface RecordingIPCOptions {
  setAssertionInfo: (info: PendingAssertion | null) => void
}

/**
 * Set when Stop & save (or leaving) already saved the recording's trace, so main's
 * 'recording-stopped' doesn't save it again. Cleared when the next recording starts.
 */
let traceSaved = false
export const traceSavedOnStop = (): void => {
  traceSaved = true
}

export function useRecordingIPC({ setAssertionInfo }: RecordingIPCOptions): void {
  const { setRunOutput } = useRunOutputStore.getState()

  useEffect(() => {
    // The test the recording started on. Steps that arrive late, after another test was
    // opened, belong to the recorded test, never to the one open now
    let recordedTestId: string | null = null
    const forRecordedTest = (update: (test: Test) => Test): void =>
      useRecorderStore
        .getState()
        .updateActiveTest((prev) =>
          prev && (recordedTestId === null || prev.id === recordedTestId) ? update(prev) : prev
        )
    const appendStep = (step: Step): void =>
      forRecordedTest((prev) => ({ ...prev, steps: [...prev.steps, step] }))

    const handleRecordingStarted = (_event: Electron.IpcRendererEvent, loadedUrl: string): void => {
      const {
        recordingTarget,
        setIsRecording,
        activeTest,
        setActiveTest,
        breakpointIndex,
        setBreakpointIndex,
        setIsReplayingToBreakpoint
      } = useRecorderStore.getState()
      // A recording the user left while it started: it is being stopped, and must not
      // replace the steps of the test open now
      if (!recordingTarget) return
      setIsRecording(true)
      recordedTestId = activeTest?.id ?? null
      traceSaved = false
      if (activeTest) {
        if (breakpointIndex !== null) {
          // Keep the pre-breakpoint steps; new recorded steps will append after them
          const keptSteps = activeTest.steps.slice(0, breakpointIndex + 1)
          setActiveTest({ ...activeTest, steps: keptSteps, trace: [] })
          setBreakpointIndex(null)
          setIsReplayingToBreakpoint(false)
        } else {
          const navigate: Step = { id: crypto.randomUUID(), kind: 'navigate', url: loadedUrl }
          setActiveTest({ ...activeTest, steps: [navigate], trace: [] })
        }
      }
      setRunOutput('')
    }

    const handleReplayFailed = (_event: Electron.IpcRendererEvent, errorMsg: string): void => {
      useRecorderStore.getState().setIsReplayingToBreakpoint(false)
      useRecorderStore.getState().setBreakpointIndex(null)
      // Error toast is shown by the caller in Recorder/index.tsx
      console.error('Replay failed:', errorMsg)
    }

    const handleRecordingStopped = async (): Promise<void> => {
      const { activeTest, updateActiveTest } = useRecorderStore.getState()
      useRecorderStore.getState().setIsRecording(false)
      if (traceSaved) return
      if (activeTest?.trace?.length) {
        const result = await window.api.saveTrace(activeTest.id, activeTest.trace)
        if (result.success) {
          // Mark the test as it is now: steps can still arrive while the trace is saved
          updateActiveTest((live) =>
            live && live.id === activeTest.id ? { ...live, hasTrace: true } : live
          )
        }
      }
    }

    const handleNewStep = (_event: Electron.IpcRendererEvent, step: Step): void => {
      appendStep(step)
    }

    const handleNewTraceStep = (_event: Electron.IpcRendererEvent, traceStep: TraceStep): void => {
      forRecordedTest((prev) => ({ ...prev, trace: [...(prev.trace || []), traceStep] }))
    }

    // Complete steps are added directly; text checks first ask the user for the expected text
    const handleAddAssertion = (
      _event: Electron.IpcRendererEvent,
      message: AssertionMessage
    ): void => {
      if (isPendingAssertion(message)) {
        setAssertionInfo(message)
      } else {
        appendStep(message)
      }
    }

    const startCleanup = window.electron.ipcRenderer.on('recording-started', handleRecordingStarted)
    const stopCleanup = window.electron.ipcRenderer.on('recording-stopped', handleRecordingStopped)
    const stepCleanup = window.electron.ipcRenderer.on('new-recorded-step', handleNewStep)
    const assertionCleanup = window.electron.ipcRenderer.on(
      'add-assertion-step',
      handleAddAssertion
    )
    const traceCleanup = window.electron.ipcRenderer.on('new-trace-step', handleNewTraceStep)
    const replayFailedCleanup = window.electron.ipcRenderer.on('replay-failed', handleReplayFailed)

    return (): void => {
      startCleanup?.()
      stopCleanup?.()
      stepCleanup?.()
      assertionCleanup?.()
      traceCleanup?.()
      replayFailedCleanup?.()
    }
  }, [])
}
