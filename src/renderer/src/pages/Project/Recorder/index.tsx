import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import Button from '@components/Button'
import CommandList from '@components/CommandList'
import TestSuitePanel from '@components/TestSuitePanel'

// Define the shape of our data with unique IDs
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
  url: 'https://www.wikipedia.org',
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

  const handleDeleteSuite = useCallback((suiteIdToDelete: string) => {
    // Add a confirmation dialog for destructive actions
    if (window.confirm('Are you sure you want to delete this suite and all its tests?')) {
      window.api.deleteSuite(suiteIdToDelete).then(() => {
        if (activeSuiteId === suiteIdToDelete) {
          setActiveSuiteId(null);
          setActiveTest(null);
        }
      });
    }
  }, [activeSuiteId]);

  const handleSuiteChange = (suiteId: string) => {
    setActiveSuiteId(suiteId);
    const suite = suites.find(s => s.id === suiteId);
    // When a suite is selected, pick its first test, or set to null if empty
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
      // Set as active test so the user can edit the name and URL
      setActiveTest(newTest);
      // Immediately save it to create the entry in the backend. The user can save again later.
      window.api.saveTest(activeSuiteId, newTest);
    }
  };

  // --- Backend Communication Handlers ---

  const handleStartRecording = useCallback(async (): Promise<void> => {
    if (activeTest?.url) {
      // Set the URL in the main process right before opening the window
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
      await handleSaveTest(); // Always save latest changes before running
      setIsRunning(true);
      setRunOutput(`Running test: ${activeTest.name}...`);
      const result = await window.api.runTest(activeSuiteId, activeTest.id);
      setRunOutput(result.output);
      setIsRunning(false);
    }
  }, [activeSuiteId, activeTest, handleSaveTest]);


  // NEW: Handler to update the order of tests within a suite
  const handleReorderTests = useCallback((suiteId: string, reorderedTests: Test[]) => {
    setSuites(prevSuites =>
      prevSuites.map(suite => {
        if (suite.id === suiteId) {
          // Return the suite with the newly ordered tests
          return { ...suite, tests: reorderedTests };
        }
        return suite;
      })
    );
    // Note: To persist this change, you would also make an IPC call here
    // to update the suite in the main process.
  }, []);

  const handleRunAllTests = useCallback(async (suiteId: string) => {
    const suiteToRun = suites.find(s => s.id === suiteId);
    if (suiteToRun) {
      // First save any pending changes to the currently active test
      await handleSaveTest();
      setIsRunning(true);
      setRunOutput(`Running suite: ${suiteToRun.name}...`);
      // Call the new backend API for running a suite
      const result = await window.api.runSuite(suiteId);
      setRunOutput(result.output);
      setIsRunning(false);
    }
  }, [suites, handleSaveTest]);

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

    const handleRecordingStarted = (_event: any, loadedUrl: string): void => {
      setIsRecording(true);
      // Use the ref here to get the current test and reset its steps
      const currentTest = activeTestRef.current;
      if (currentTest) {
        setActiveTest({ ...currentTest, steps: [`@driver.get("${loadedUrl}")`] });
      }
      setRunOutput('');
    };
    const handleRecordingStopped = () => setIsRecording(false);

    const handleNewCommand = (_event: any, command: string): void => {
      // By using the ref, we get the LATEST activeTest state and append the new command,
      // which prevents the infinite loop.
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
  }, []); // The empty dependency array [] is crucial.

  return (
    <div className="flex flex-row h-full w-full">
      {/* --- Left Panel: Test Suite --- */}
      {/* The width is increased here to prevent overflow */}
      <div className="w-1/3 max-w-md">
        <TestSuitePanel
          suites={suites}
          activeSuiteId={activeSuiteId}
          activeTestId={activeTest?.id ?? null}
          onSuiteChange={handleSuiteChange}
          onTestSelect={handleTestSelect}
          onCreateSuite={handleCreateSuite}
          onDeleteSuite={handleDeleteSuite}
          onReorderTests={handleReorderTests}
          onRunAllTests={handleRunAllTests}
        />
      </div>

      {/* --- Right Panel: Main Recorder View --- */}
      <div className="flex-1 flex flex-col p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">{activeSuite?.name ?? 'No Suite Selected'}</h2>
        </div>

        <div className="flex items-center space-x-2 flex-wrap gap-y-2">
          <input type="text" value={activeTest?.name ?? ''} onChange={(e) => setActiveTest(p => p ? {...p, name: e.target.value} : null)} placeholder="Test Name" className="flex-grow p-2 border rounded" disabled={!activeTest} />
          <input type="text" value={activeTest?.url ?? ''} onChange={(e) => setActiveTest(p => p ? {...p, url: e.target.value} : null)} placeholder="Test URL" className="w-1/3 flex-grow p-2 border rounded" disabled={!activeTest} />
        </div>

        {/* --- Action Buttons Using Custom Button Component --- */}
        <div className="flex items-center justify-between flex-wrap gap-y-2 border-t border-gray-200 pt-4">
          <div className="flex items-center space-x-2">
            <Button onClick={handleStartRecording} disabled={!activeTest || isRecording} type={isRecording ? 'disabled' : 'primary'}>
              <span className="mr-2 text-lg">🔴</span> Record
            </Button>
            <Button onClick={handleStopRecording} disabled={!isRecording} type={!isRecording ? 'disabled' : 'secondary'}>
              <span className="mr-2 text-lg">⏹️</span> Stop
            </Button>
            <Button onClick={handleRunTest} disabled={!activeTest || isRecording || isRunning} type={(!activeTest || isRecording || isRunning) ? 'disabled' : 'success'}>
              <span className="mr-1 text-lg">▶️</span> Run
            </Button>
          </div>
          <div className="flex items-center space-x-2">
            <Button onClick={handleSaveTest} disabled={!activeTest || isRecording} type={(!activeTest || isRecording) ? 'disabled' : 'primary'}>
              <span className="mr-1 text-lg">💾</span> Save
            </Button>
            <Button onClick={handleNewTest} disabled={!activeSuite} type={!activeSuite ? 'disabled' : 'secondary'}>
              <span className="mr-2 text-lg">✨</span> New Test
            </Button>
          </div>
        </div>

        <div className="flex-grow flex flex-row space-x-4 min-h-0">
          <div className="rounded p-4 flex-col">
            <div className="flex-grow min-h-0">
              <CommandList
                steps={activeTest?.steps ?? []}
                setSteps={(newSteps) => setActiveTest(p => p ? {...p, steps: newSteps} : null)}
                onDeleteStep={(indexToDelete) => setActiveTest(p => p ? { ...p, steps: p.steps.filter((_, i) => i !== indexToDelete) } : null)}
              />
            </div>
          </div>
          <div className="rounded p-4 text-black font-mono flex flex-col">
            <h3 className="text-lg font-semibold mb-2">Run Output</h3>
            <pre className="w-full flex-grow p-2 border rounded bg-black text-white border-gamma-900 resize-none text-sm overflow-auto whitespace-pre-wrap">{runOutput || 'Test output will appear here...'}</pre>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Recorder
