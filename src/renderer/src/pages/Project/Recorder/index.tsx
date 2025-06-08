import React, { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import CommandList from '@components/CommandList' // Import the new component

const Recorder: React.FC = (): JSX.Element => {
  const { t } = useTranslation()

  // --- State (No changes here) ---
  const [url, setUrl] = useState<string>('https://www.google.com')
  const [recordedSteps, setRecordedSteps] = useState<string[]>([])
  const [isRecording, setIsRecording] = useState<boolean>(false)

  // --- UI Handlers (No changes here) ---
  const handleSetUrl = useCallback((): void => {
    if (url) {
      window.api.loadUrlRequest(url).then(() => {
        console.log(`[Recorder] Project URL has been set to: ${url}`)
      })
    }
  }, [url])

  const handleStartRecording = useCallback((): void => {
    window.api.startRecordingMain()
  }, [])

  const handleStopRecording = useCallback((): void => {
    window.api.stopRecordingMain()
  }, [])

  // --- Side Effects (No changes here) ---
  useEffect(() => {
    const handleRecordingStarted = (_event: any, loadedUrl: string): void => {
      setIsRecording(true)
      setRecordedSteps([`driver.get("${loadedUrl}")`])
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
      {/* Control bar remains the same */}
      <div className="flex items-center space-x-2">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={t('recorder.placeholder.url')}
          className="flex-grow p-2 border rounded"
        />
        <button
          onClick={handleSetUrl}
          className="p-2 bg-gray-500 text-white rounded hover:bg-gray-600"
        >
          {t('recorder.button.setUrl')}
        </button>
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
      </div>

      {/* This container now uses our new CommandList component */}
      <div className="flex-grow border rounded p-4 bg-gray-50 flex flex-col min-h-0">
        <h3 className="text-lg font-semibold mb-2">{t('recorder.heading.recordedSteps')}</h3>
        {/* The textarea is replaced with our new component */}
        <div className="flex-grow">
          <CommandList steps={recordedSteps} />
        </div>
      </div>
    </div>
  )
}

export default Recorder
