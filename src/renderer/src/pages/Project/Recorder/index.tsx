import React, { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import CommandList from '@components/CommandList'

const Recorder: React.FC = (): JSX.Element => {
  const { t } = useTranslation()

  // --- State ---
  const [url, setUrl] = useState<string>('https://www.google.com')
  const [testName, setTestName] = useState<string>('My First Test') // State for the test name
  const [recordedSteps, setRecordedSteps] = useState<string[]>([])
  const [isRecording, setIsRecording] = useState<boolean>(false)
  const [runOutput, setRunOutput] = useState<string>('')
  const [isRunning, setIsRunning] = useState<boolean>(false)

  // --- UI Handlers ---
  const handleStartRecording = useCallback(async (): Promise<void> => {
    if (url) {
      await window.api.loadUrlRequest(url)
      window.api.startRecordingMain()
    }
  }, [url])

  const handleStopRecording = useCallback((): void => {
    window.api.stopRecordingMain()
  }, [])

  // NEW: Handler for the dedicated "Save Test" button
  const handleSaveRecording = useCallback((): void => {
    if (!testName) {
      // You can also show an error notification to the user
      console.error("Cannot save test without a name.");
      return;
    }
    // Calls the 'save-recording' IPC channel with the test name and steps
    window.api.saveRecording(testName, recordedSteps).then((result) => {
      if (result.success) {
        console.log(`[Recorder] Test "${testName}" saved successfully.`)
      }
    })
  }, [testName, recordedSteps])

  // This handler now only runs the test that was last saved.
  const handleRunTest = useCallback(async (): Promise<void> => {
    setIsRunning(true)
    setRunOutput('Running last saved test...')
    const result = await window.api.runRecording()
    setRunOutput(result.output)
    setIsRunning(false)
  }, [])

  const handleDeleteStep = useCallback((indexToDelete: number) => {
    setRecordedSteps((prev) => prev.filter((_, index) => index !== indexToDelete))
  }, [])

  // --- Side Effects ---
  useEffect(() => {
    const handleRecordingStarted = (_event: any, loadedUrl: string): void => {
      setIsRecording(true)
      setRecordedSteps([`@driver.get("${loadedUrl}")`])
      setRunOutput('')
    }

    const handleRecordingStopped = (): void => {
      setIsRecording(false)
    }

    const handleNewCommand = (_event: any, command: string): void => {
      setRecordedSteps((prevSteps) => [...prevSteps, command])
    }

    const cleanupStart = window.electron.ipcRenderer.on('recording-started', handleRecordingStarted)
    const cleanupStop = window.electron.ipcRenderer.on('recording-stopped', handleRecordingStopped)
    const cleanupCommand = window.electron.ipcRenderer.on('new-recorded-command', handleNewCommand)

    return () => {
      cleanupStart?.()
      cleanupStop?.()
      cleanupCommand?.()
    }
  }, [])

  // --- Rendering ---
  return (
    <div className="flex flex-col h-full w-full p-4 space-y-4">
      {/* Control bar */}
      <div className="flex items-center space-x-2 flex-wrap gap-y-2">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={t('recorder.placeholder.url')}
          className="w-1/3 flex-grow p-2 border rounded"
        />
        {/* Test Name Input Field */}
        <input
          type="text"
          value={testName}
          onChange={(e) => setTestName(e.target.value)}
          placeholder="Enter test name"
          className="w-1/3 flex-grow p-2 border rounded"
        />
        <button
          onClick={handleStartRecording}
          disabled={isRecording}
          className="p-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-400"
        >
          {t('recorder.button.startRecording')}
        </button>
        <button
          onClick={handleStopRecording}
          disabled={!isRecording}
          className="p-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:bg-gray-400"
        >
          {t('recorder.button.stopRecording')}
        </button>
        {/* Re-introduced Save Test Button */}
        <button
          onClick={handleSaveRecording}
          disabled={isRecording || recordedSteps.length === 0}
          className="p-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400"
        >
          {t('recorder.button.saveTest')}
        </button>
        <button
          onClick={handleRunTest}
          disabled={isRecording || isRunning}
          className="p-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:bg-gray-400"
        >
          {t('recorder.button.runTest')}
        </button>
      </div>
      {/* Main Content Area */}
      <div className="flex-grow flex flex-row space-x-4 min-h-0">
        <div className="w-1/2 border rounded p-4 bg-gray-50 flex flex-col">
          <h3 className="text-lg font-semibold mb-2">{t('recorder.heading.recordedSteps')}</h3>
          <div className="flex-grow min-h-0">
            <CommandList
              steps={recordedSteps}
              setSteps={setRecordedSteps}
              onDeleteStep={handleDeleteStep}
            />
          </div>
        </div>

        <div className="w-1/2 border rounded p-4 bg-gray-900 text-white font-mono flex flex-col">
          <h3 className="text-lg font-semibold mb-2">{t('recorder.heading.runOutput')}</h3>
          <pre className="w-full flex-grow p-2 border rounded bg-black border-gray-700 resize-none text-sm overflow-auto whitespace-pre-wrap">
            {runOutput || 'Test output will appear here...'}
          </pre>
        </div>
      </div>
    </div>
  )
}

export default Recorder
