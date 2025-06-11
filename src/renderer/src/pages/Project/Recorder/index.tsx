import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import CommandList from '@components/CommandList'
import TestSuitePanel from '@components/TestSuitePanel'

// Define a common structure for our data
interface Test {
  id: string;
  name: string;
  url: string;
  steps: string[];
}
interface Suite {
  id: string;
  name: string;
  tests: Test[];
}

/**
 * Creates a new, blank test object.
 */
const createNewTest = (): Test => ({
  id: crypto.randomUUID(), // Uses the browser's built-in crypto
  name: 'Untitled Test',
  url: 'https://www.google.com',
  steps: [],
});


const Recorder: React.FC = (): JSX.Element => {
  const { t } = useTranslation()

  // --- State ---
  const [suites, setSuites] = useState<Suite[]>([]);
  const [activeSuiteId, setActiveSuiteId] = useState<string | null>(null);
  const [activeTest, setActiveTest] = useState<Test | null>(null);

  const [isRecording, setIsRecording] = useState<boolean>(false)
  const [runOutput, setRunOutput] = useState<string>('')
  const [isRunning, setIsRunning] = useState<boolean>(false)

  // --- Refs ---
  // This ref is the key to fixing the unresponsive UI.
  // It always holds the latest version of activeTest for our IPC listeners.
  const activeTestRef = useRef(activeTest);
  useEffect(() => {
    activeTestRef.current = activeTest;
  }, [activeTest]);

  const activeSuite = React.useMemo(() => suites.find(s => s.id === activeSuiteId), [suites, activeSuiteId]);

  // --- UI and State Handlers ---
  const handleCreateSuite = useCallback((suiteName: string) => {
    if (suiteName && !suites.find(s => s.name === suiteName)) {
      window.api.createSuite(suiteName);
    }
  }, [suites]);

  const handleSuiteChange = (suiteId: string) => {
    setActiveSuiteId(suiteId);
    const suite = suites.find(s => s.id === suiteId);
    setActiveTest(suite?.tests[0] ?? null);
  };

  const handleTestSelect = (testId: string) => {
    const test = activeSuite?.tests.find(t => t.id === testId);
    if (test) {
      setActiveTest(test);
    }
  };

  const handleNewTest = () => {
    if (activeSuiteId) {
      const newTest = createNewTest();
      // Set as active test to begin editing
      setActiveTest(newTest);
      // Immediately save it to the backend
      window.api.saveTest(activeSuiteId, newTest);
    }
  };

  // --- Backend Communication Handlers ---
  const handleStartRecording = useCallback(async (): Promise<void> => {
    if (activeTest?.url) {
      await window.api.loadUrlRequest(activeTest.url);
      window.api.startRecordingMain();
    }
  }, [activeTest]);

  const handleStopRecording = useCallback((): void => {
    window.api.stopRecordingMain()
  }, []);

  const handleSaveTest = useCallback((): void => {
    if (activeSuiteId && activeTest?.name) {
      window.api.saveTest(activeSuiteId, activeTest);
    }
  }, [activeSuiteId, activeTest]);

  const handleRunTest = useCallback(async (): Promise<void> => {
    if (activeSuiteId && activeTest?.id) {
      await handleSaveTest(); // Always save latest changes
      setIsRunning(true);
      setRunOutput(`Running test: ${activeTest.name}...`);
      const result = await window.api.runTest(activeSuiteId, activeTest.id);
      setRunOutput(result.output);
      setIsRunning(false);
    }
  }, [activeSuiteId, activeTest, handleSaveTest]);

  // --- Side Effects ---
  useEffect(() => {
    // This effect runs only ONCE to set up all IPC listeners.

    window.api.getSuites().then((initialSuites) => {
      setSuites(initialSuites);
      if (initialSuites.length > 0) {
        const firstSuite = initialSuites[0];
        setActiveSuiteId(firstSuite.id);
        setActiveTest(firstSuite.tests[0] ?? null);
      }
    });

    const suiteUpdatedCleanup = window.electron.ipcRenderer.on('suite-updated', (_event, updatedSuites) => {
      setSuites(updatedSuites);
    });

    const handleRecordingStarted = (_event, loadedUrl) => {
      setIsRecording(true);
      const currentTest = activeTestRef.current;
      if (currentTest) {
        setActiveTest({ ...currentTest, steps: [`@driver.get("${loadedUrl}")`] });
      }
      setRunOutput('');
    };
    const handleRecordingStopped = () => setIsRecording(false);

    const handleNewCommand = (_event, command) => {
      const currentTest = activeTestRef.current;
      if (currentTest) {
        setActiveTest({ ...currentTest, steps: [...currentTest.steps, command] });
      }
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
  }, []);

  return (
    <div className="flex flex-row h-full w-full">
      <div className="w-1/4 max-w-xs">
        <TestSuitePanel
          suites={suites}
          activeSuiteId={activeSuiteId}
          activeTestId={activeTest?.id ?? null}
          onSuiteChange={handleSuiteChange}
          onTestSelect={handleTestSelect}
          onCreateSuite={handleCreateSuite}
        />
      </div>

      <div className="flex-1 flex flex-col p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">{activeSuite?.name ?? 'No Suite Selected'}</h2>
          <div>
            <button onClick={handleNewTest} disabled={!activeSuite} className="p-2 bg-indigo-500 text-white rounded hover:bg-indigo-600 disabled:bg-gray-400">
              New Test
            </button>
          </div>
        </div>

        <div className="flex items-center space-x-2 flex-wrap gap-y-2">
          <input type="text" value={activeTest?.name ?? ''} onChange={(e) => setActiveTest(p => p ? {...p, name: e.target.value} : null)} placeholder="Test Name" className="w-1/3 flex-grow p-2 border rounded" disabled={!activeTest} />
          <input type="text" value={activeTest?.url ?? ''} onChange={(e) => setActiveTest(p => p ? {...p, url: e.target.value} : null)} placeholder="Test URL" className="w-1/3 flex-grow p-2 border rounded" disabled={!activeTest} />
          <button onClick={handleStartRecording} disabled={!activeTest || isRecording} className="p-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-400">Record</button>
          <button onClick={handleStopRecording} disabled={!isRecording} className="p-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:bg-gray-400">Stop</button>
          <button onClick={handleSaveTest} disabled={!activeTest || isRecording} className="p-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400">Save</button>
          <button onClick={handleRunTest} disabled={!activeTest || isRecording || isRunning} className="p-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:bg-gray-400">Run</button>
        </div>

        <div className="flex-grow flex flex-row space-x-4 min-h-0">
          <div className="w-1/2 border rounded p-4 bg-gray-50 flex flex-col">
            <h3 className="text-lg font-semibold mb-2">Recorded Steps</h3>
            <div className="flex-grow min-h-0">
              <CommandList
                steps={activeTest?.steps ?? []}
                setSteps={(newSteps) => setActiveTest(p => p ? {...p, steps: newSteps} : null)}
                onDeleteStep={(indexToDelete) => setActiveTest(p => p ? { ...p, steps: p.steps.filter((_, i) => i !== indexToDelete) } : null)}
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
