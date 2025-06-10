import React, { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import CommandList from '@components/CommandList'
import TestSuite from '@components/TestSuite'

// Define a type for our test object for clarity
interface Test {
  name: string;
  url: string;
  steps: string[];
}

/**
 * Creates a new, blank test object.
 * @returns A new Test object with default values.
 */
const createNewTest = (): Test => ({
  name: 'Untitled Test',
  url: 'https://www.google.com',
  steps: [],
});


const Recorder: React.FC = (): JSX.Element => {
  const { t } = useTranslation()

  // --- State ---
  const [suite, setSuite] = useState<Test[]>([]);
  // Initialize state with a new, empty test so the UI is never null
  const [activeTest, setActiveTest] = useState<Test | null>(createNewTest());

  const [isRecording, setIsRecording] = useState<boolean>(false)
  const [runOutput, setRunOutput] = useState<string>('')
  const [isRunning, setIsRunning] = useState<boolean>(false)

  // --- UI Handlers ---
  const handleStartRecording = useCallback(async (): Promise<void> => {
    if (activeTest?.url) {
      await window.api.loadUrlRequest(activeTest.url);
      window.api.startRecordingMain();
    }
  }, [activeTest]);

  const handleStopRecording = useCallback((): void => {
    window.api.stopRecordingMain()
  }, [])

  const handleSaveTest = useCallback((): void => {
    if (activeTest && activeTest.name) {
      window.api.saveRecording(activeTest).then(res => {
        if(res.success) console.log(`Test "${activeTest.name}" saved.`);
      });
    }
  }, [activeTest]);

  const handleRunTest = useCallback(async (): Promise<void> => {
    if (activeTest?.name) {
      await handleSaveTest(); // Always save latest changes before running
      setIsRunning(true);
      setRunOutput(`Running test: ${activeTest.name}...`);
      const result = await window.api.runRecording(activeTest.name);
      setRunOutput(result.output);
      setIsRunning(false);
    }
  }, [activeTest, handleSaveTest]);

  const handleTestSelect = (testName: string) => {
    const testToLoad = suite.find(t => t.name === testName);
    if (testToLoad) {
      setActiveTest(testToLoad);
    }
  };

  // Handler to start a new, fresh test recording
  const handleNewTest = () => {
    setActiveTest(createNewTest());
  };

  // --- Side Effects ---
  useEffect(() => {
    // This effect now runs only ONCE and sets up all IPC listeners correctly.

    // Load initial data
    window.api.getTestSuite().then(setSuite);

    // Listeners that update the suite list
    const suiteUpdatedCleanup = window.electron.ipcRenderer.on('suite-updated', (_event, updatedSuite: Test[]) => {
      setSuite(updatedSuite);
    });

    // Listeners that update the active test and recording status
    const handleRecordingStarted = (_event: any, loadedUrl: string): void => {
      setIsRecording(true);
      // Use functional setState. This correctly resets the steps for the active test.
      setActiveTest(prev => prev ? { ...prev, steps: [`@driver.get("${loadedUrl}")`] } : null);
      setRunOutput('');
    };

    const handleRecordingStopped = (): void => {
      setIsRecording(false);
    };

    const handleNewCommand = (_event: any, command: string): void => {
      // Use functional setState. This is the key to breaking the infinite loop.
      // It reliably gets the previous state without needing it in a closure.
      setActiveTest(prev => prev ? { ...prev, steps: [...prev.steps, command] } : null);
    };

    const startCleanup = window.electron.ipcRenderer.on('recording-started', handleRecordingStarted);
    const stopCleanup = window.electron.ipcRenderer.on('recording-stopped', handleRecordingStopped);
    const commandCleanup = window.electron.ipcRenderer.on('new-recorded-command', handleNewCommand);

    return () => {
      suiteUpdatedCleanup?.();
      startCleanup?.();
      stopCleanup?.();
      commandCleanup?.();
    };
  }, []); // The empty dependency array [] fixes the infinite loop.

  // --- Rendering ---
  return (
    <div className="flex flex-row h-full w-full">
      {/* Left Panel: Test Suite */}
      <div className="w-1/4 border-r">
        <TestSuite suite={suite} activeTestName={activeTest?.name ?? ''} onTestSelect={handleTestSelect} />
      </div>

      {/* Right Panel: Main Recorder View */}
      <div className="flex-1 flex flex-col p-4 space-y-4">
        {/* Top Control Bar */}
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Test Editor</h2>
          {/* New Test Button */}
          <button onClick={handleNewTest} className="p-2 bg-indigo-500 text-white rounded hover:bg-indigo-600">New Test</button>
        </div>

        {/* Input and Action Bar */}
        <div className="flex items-center space-x-2 flex-wrap gap-y-2">
          <input
            type="text"
            value={activeTest?.name ?? ''}
            onChange={(e) => setActiveTest(prev => prev ? { ...prev, name: e.target.value } : null)}
            placeholder="Enter test name"
            className="w-1/3 flex-grow p-2 border rounded"
            disabled={!activeTest}
          />
          <input
            type="text"
            value={activeTest?.url ?? ''}
            onChange={(e) => setActiveTest(prev => prev ? { ...prev, url: e.target.value } : null)}
            placeholder={t('recorder.placeholder.url')}
            className="w-1/3 flex-grow p-2 border rounded"
            disabled={!activeTest}
          />
          <button onClick={handleStartRecording} disabled={!activeTest || isRecording} className="p-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-400">Record</button>
          <button onClick={handleStopRecording} disabled={!isRecording} className="p-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:bg-gray-400">Stop</button>
          <button onClick={handleSaveTest} disabled={!activeTest || isRecording} className="p-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400">Save</button>
          <button onClick={handleRunTest} disabled={!activeTest || isRecording || isRunning} className="p-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:bg-gray-400">Run</button>
        </div>

        {/* Content Area */}
        <div className="flex-grow flex flex-row space-x-4 min-h-0">
          <div className="w-1/2 border rounded p-4 bg-gray-50 flex flex-col">
            <h3 className="text-lg font-semibold mb-2">Recorded Steps</h3>
            <div className="flex-grow min-h-0">
              <CommandList
                steps={activeTest?.steps ?? []}
                setSteps={(newSteps) => setActiveTest(prev => prev ? { ...prev, steps: newSteps } : null)}
                onDeleteStep={(indexToDelete) => setActiveTest(prev => prev ? { ...prev, steps: prev.steps.filter((_, i) => i !== indexToDelete) } : null)}
              />
            </div>
          </div>
          <div className="w-1/2 border rounded p-4 bg-gray-900 text-white font-mono flex flex-col">
            <h3 className="text-lg font-semibold mb-2">Run Output</h3>
            <pre className="w-full flex-grow p-2 border rounded bg-black border-gray-700 resize-none text-sm overflow-auto whitespace-pre-wrap">{runOutput || 'Test output will appear here...'}</pre>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Recorder
