import React, { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'

// We no longer need WebviewTag or the injected scripts here, as the
// main process will handle the new window directly.

const Recorder: React.FC = (): JSX.Element => {
  const { t } = useTranslation()

  // --- State ---
  const [url, setUrl] = useState<string>('https://www.google.com')
  const [recordedSteps, setRecordedSteps] = useState<string[]>([])
  const [isRecording, setIsRecording] = useState<boolean>(false)
  // The webviewRef is no longer needed.

  // --- UI Handlers (These remain the same) ---
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

  // --- Side Effects ---

  // This effect now only listens for simple state changes from the Main Process.
  useEffect(() => {
    // Main process says the new window is open and recording has begun.
    const handleRecordingStarted = (): void => {
      setIsRecording(true)
      // We can add the 'open' command as the first step.
      setRecordedSteps(prev => [`driver.get("${url}")`, ...prev.slice(1)])
    }

    // Main process says the recorder window was closed.
    const handleRecordingStopped = (): void => {
      setIsRecording(false)
    }

    // Subscribe to the new events
    const cleanupStart = window.electron.ipcRenderer.on('recording-started', handleRecordingStarted)
    const cleanupStop = window.electron.ipcRenderer.on('recording-stopped', handleRecordingStopped)

    return () => {
      cleanupStart?.()
      cleanupStop?.()
    }
  }, [url]) // Depend on URL to ensure the "driver.get" command is up-to-date.

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

      {/* The main area now ONLY shows the recorded steps. */}
      <div className="flex-grow border rounded p-4 bg-gray-50 flex flex-col">
        <h3 className="text-lg font-semibold mb-2">{t('recorder.heading.recordedSteps')}</h3>
        <textarea
          readOnly
          value={recordedSteps.join('\n')}
          className="w-full flex-grow p-2 border rounded bg-white resize-none"
          placeholder={t('recorder.placeholder.commands')}
        />
      </div>
    </div>
  )
}

export default Recorder
