import { useEffect } from 'react'
import useRecorderStore from '@foundation/Stores/recorderStore'
import useRunOutputStore from '@foundation/Stores/runOutputStore'
import { formatLocator } from '@foundation/recorderUtils'
import type { TraceStep } from '@foundation/Types/traceStep'

interface AssertionInfo {
  selector: string
  text: string
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
      const { setIsRecording, activeTest, setActiveTest } = useRecorderStore.getState()
      setIsRecording(true)
      if (activeTest) {
        setActiveTest({ ...activeTest, steps: [`@driver.get("${loadedUrl}")`], trace: [] })
      }
      setRunOutput('')
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
      let newStep = ''

      switch (assertion.type) {
        case 'wait-displayed':
          newStep = `@wait.until { @driver.find_element(:${strategy}, ${value}).displayed? }`
          useRecorderStore.getState().updateActiveTest((prev) =>
            prev ? { ...prev, steps: [...prev.steps, newStep] } : null
          )
          break
        case 'wait-enabled':
          newStep = `@wait.until { @driver.find_element(:${strategy}, ${value}).enabled? }`
          useRecorderStore.getState().updateActiveTest((prev) =>
            prev ? { ...prev, steps: [...prev.steps, newStep] } : null
          )
          break
        case 'displayed':
          newStep = `expect(@driver.find_element(:${strategy}, ${value})).to be_displayed`
          useRecorderStore.getState().updateActiveTest((prev) =>
            prev ? { ...prev, steps: [...prev.steps, newStep] } : null
          )
          break
        case 'enabled':
          newStep = `expect(@driver.find_element(:${strategy}, ${value})).to be_enabled`
          useRecorderStore.getState().updateActiveTest((prev) =>
            prev ? { ...prev, steps: [...prev.steps, newStep] } : null
          )
          break
        case 'text':
          setAssertionInfo({ selector: assertion.selector, text: assertion.text ?? '' })
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

    return (): void => {
      startCleanup?.()
      stopCleanup?.()
      commandCleanup?.()
      assertionCleanup?.()
      traceCleanup?.()
    }
  }, [])
}
