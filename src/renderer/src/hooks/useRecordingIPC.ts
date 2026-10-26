import { useEffect } from 'react'
import useRecorderStore from '@foundation/Stores/recorderStore'
import useRunOutputStore from '@foundation/Stores/runOutputStore'
import type { TraceStep } from '@foundation/Types/traceStep'
import type { Step } from '@shared/types/step'
import { isPendingAssertion } from '@shared/types/pendingAssertion'
import type { AssertionMessage, PendingAssertion } from '@shared/types/pendingAssertion'

interface RecordingIPCOptions {
  setAssertionInfo: (info: PendingAssertion | null) => void
}

const appendStep = (step: Step): void => {
  useRecorderStore
    .getState()
    .updateActiveTest((prev) => (prev ? { ...prev, steps: [...prev.steps, step] } : null))
}

export function useRecordingIPC({ setAssertionInfo }: RecordingIPCOptions): void {
  const { setRunOutput } = useRunOutputStore.getState()

  useEffect(() => {
    const handleRecordingStarted = (_event: Electron.IpcRendererEvent, loadedUrl: string): void => {
      const {
        setIsRecording,
        activeTest,
        setActiveTest,
        breakpointIndex,
        setBreakpointIndex,
        setIsReplayingToBreakpoint
      } = useRecorderStore.getState()
      setIsRecording(true)
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
      const { activeTest, setActiveTest } = useRecorderStore.getState()
      useRecorderStore.getState().setIsRecording(false)
      if (activeTest?.trace?.length) {
        const result = await window.api.saveTrace(activeTest.id, activeTest.trace)
        if (result.success) {
          setActiveTest({ ...activeTest, hasTrace: true })
        }
      }
    }

    const handleNewStep = (_event: Electron.IpcRendererEvent, step: Step): void => {
      appendStep(step)
    }

    const handleNewTraceStep = (_event: Electron.IpcRendererEvent, traceStep: TraceStep): void => {
      useRecorderStore
        .getState()
        .updateActiveTest((prev) =>
          prev ? { ...prev, trace: [...(prev.trace || []), traceStep] } : null
        )
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
