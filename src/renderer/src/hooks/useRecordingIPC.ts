import { useEffect } from 'react'
import useRecorderStore from '@foundation/Stores/recorderStore'
import useRunOutputStore from '@foundation/Stores/runOutputStore'
import { formatLocator } from '@foundation/recorderUtils'
import type { TraceStep } from '@foundation/Types/traceStep'

interface AssertionInfo {
  selector: string
  text: string
  assertionType?: string
}

interface RecordingIPCOptions {
  setAssertionInfo: (info: AssertionInfo | null) => void
}

export function useRecordingIPC({ setAssertionInfo }: RecordingIPCOptions): void {
  const { setRunOutput } = useRunOutputStore.getState()

  useEffect(() => {
    const handleRecordingStarted = (
      _event: Electron.IpcRendererEvent,
      loadedUrl: string
    ): void => {
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
          // Keep the pre-breakpoint steps; new recorded commands will append after them
          const keptSteps = activeTest.steps.slice(0, breakpointIndex + 1)
          setActiveTest({ ...activeTest, steps: keptSteps, trace: [] })
          setBreakpointIndex(null)
          setIsReplayingToBreakpoint(false)
        } else {
          setActiveTest({ ...activeTest, steps: [`@driver.get("${loadedUrl}")`], trace: [] })
        }
      }
      setRunOutput('')
    }

    const handleReplayFailed = (
      _event: Electron.IpcRendererEvent,
      errorMsg: string
    ): void => {
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

    const handleNewCommand = (_event: Electron.IpcRendererEvent, command: string): void => {
      useRecorderStore.getState().updateActiveTest((prev) =>
        prev ? { ...prev, steps: [...prev.steps, command] } : null
      )
    }

    const handleNewTraceStep = (_event: Electron.IpcRendererEvent, traceStep: TraceStep): void => {
      useRecorderStore.getState().updateActiveTest((prev) =>
        prev ? { ...prev, trace: [...(prev.trace || []), traceStep] } : null
      )
    }

    const handleAddAssertion = (
      _event: Electron.IpcRendererEvent,
      assertion: { type: string; selector: string; text?: string }
    ): void => {
      const { strategy, value } = formatLocator(assertion.selector)

      const addStep = (step: string): void => {
        useRecorderStore.getState().updateActiveTest((prev) =>
          prev ? { ...prev, steps: [...prev.steps, step] } : null
        )
      }

      switch (assertion.type) {
        case 'wait-displayed':
          addStep(`@wait.until { @driver.find_element(:${strategy}, ${value}).displayed? }`)
          break
        case 'wait-disappear':
          addStep(`@wait.until { !@driver.find_element(:${strategy}, ${value}).displayed? }`)
          break
        case 'wait-enabled':
          addStep(`@wait.until { @driver.find_element(:${strategy}, ${value}).enabled? }`)
          break
        case 'displayed':
          addStep(`expect(@driver.find_element(:${strategy}, ${value})).to be_displayed`)
          break
        case 'not-displayed':
          addStep(`expect(@driver.find_element(:${strategy}, ${value})).not_to be_displayed`)
          break
        case 'enabled':
          addStep(`expect(@driver.find_element(:${strategy}, ${value})).to be_enabled`)
          break
        case 'checked':
          addStep(`expect(@driver.find_element(:${strategy}, ${value})).to be_selected`)
          break
        case 'text':
          setAssertionInfo({ selector: assertion.selector, text: assertion.text ?? '', assertionType: 'text' })
          break
        case 'text-includes':
          setAssertionInfo({ selector: assertion.selector, text: assertion.text ?? '', assertionType: 'text-includes' })
          break
        case 'value':
          setAssertionInfo({ selector: assertion.selector, text: assertion.text ?? '', assertionType: 'value' })
          break
        case 'page-title':
          setAssertionInfo({ selector: assertion.selector, text: assertion.text ?? '', assertionType: 'page-title' })
          break
        case 'page-url':
          setAssertionInfo({ selector: assertion.selector, text: assertion.text ?? '', assertionType: 'page-url' })
          break
      }
    }

    const startCleanup = window.electron.ipcRenderer.on('recording-started', handleRecordingStarted)
    const stopCleanup = window.electron.ipcRenderer.on('recording-stopped', handleRecordingStopped)
    const commandCleanup = window.electron.ipcRenderer.on('new-recorded-command', handleNewCommand)
    const assertionCleanup = window.electron.ipcRenderer.on(
      'add-assertion-step',
      handleAddAssertion
    )
    const traceCleanup = window.electron.ipcRenderer.on('new-trace-step', handleNewTraceStep)
    const replayFailedCleanup = window.electron.ipcRenderer.on('replay-failed', handleReplayFailed)

    return (): void => {
      startCleanup?.()
      stopCleanup?.()
      commandCleanup?.()
      assertionCleanup?.()
      traceCleanup?.()
      replayFailedCleanup?.()
    }
  }, [])
}
