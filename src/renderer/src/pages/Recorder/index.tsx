import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import Button from '@components/Button'
import CommandList from '@components/CommandList'
import TestSuitePanel from '@components/TestSuitePanel'
import OutputPanel from '@components/OutputPanel'
import InputField from '@components/InputField'
import { FaEye, FaCode } from 'react-icons/fa'

// Define the shape of our data with unique IDs
interface Test {
  id: string
  name: string
  url: string
  steps: string[]
}
interface Suite {
  id: string
  name: string
  tests: Test[]
}

const createNewTest = (): Test => ({
  id: crypto.randomUUID(),
  name: 'Untitled Test',
  url: 'https://www.wikipedia.org',
  steps: []
})

const Recorder: React.FC = (): JSX.Element => {
  const { t } = useTranslation()

  // --- State ---
  const [suites, setSuites] = useState<Suite[]>([])
  const [activeSuiteId, setActiveSuiteId] = useState<string | null>(null)
  const [activeTest, setActiveTest] = useState<Test | null>(null)
  const [isRecording, setIsRecording] = useState<boolean>(false)
  const [runOutput, setRunOutput] = useState<string>('')
  const [isRunning, setIsRunning] = useState<boolean>(false)
  const [showParsedText, setShowParsedText] = useState<boolean>(true)


  const StyledPanel: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    return (
      <div className="relative w-full h-full">
        <div className="relative w-full h-full flex flex-col border border-black rounded-lg bg-white z-10 overflow-y-auto p-4">
          {children}
        </div>
      </div>
    )
  }

  // --- Refs to hold the latest state for listeners ---
  const activeTestRef = useRef(activeTest)
  useEffect(() => {
    activeTestRef.current = activeTest
  }, [activeTest])

  const activeSuiteIdRef = useRef(activeSuiteId);
  useEffect(() => {
    activeSuiteIdRef.current = activeSuiteId;
  }, [activeSuiteId]);


  const activeSuite = React.useMemo(
    () => suites.find((s) => s.id === activeSuiteId),
    [suites, activeSuiteId]
  )

  // --- Handlers ---
  const handleCreateSuite = useCallback((suiteName: string) => {
    if (suiteName && !suites.find((s) => s.name === suiteName)) {
      window.api.createSuite(suiteName)
    }
  }, [suites])

  const handleDeleteSuite = useCallback((suiteIdToDelete: string) => {
    if (window.confirm('Are you sure you want to delete this suite and all its tests?')) {
      window.api.deleteSuite(suiteIdToDelete).then(() => {
        if (activeSuiteId === suiteIdToDelete) {
          setActiveSuiteId(null)
          setActiveTest(null)
        }
      })
    }
  }, [activeSuiteId])

  const handleTestDelete = useCallback((testIdToDelete: string) => {
    if (activeSuiteId) {
      window.api.deleteTest(activeSuiteId, testIdToDelete);
    }
  }, [activeSuiteId]);

  const handleSuiteChange = (suiteId: string) => {
    setActiveSuiteId(suiteId)
    const suite = suites.find((s) => s.id === suiteId)
    setActiveTest(suite?.tests[0] ?? null)
  }
  const handleTestSelect = (testId: string) => {
    const test = activeSuite?.tests.find((t) => t.id === testId)
    if (test) {
      setActiveTest(test)
    }
  }
  const handleNewTest = () => {
    if (activeSuiteId) {
      const newTest = createNewTest()
      setActiveTest(newTest)
      window.api.saveTest(activeSuiteId, newTest)
    }
  }

  const handleStartRecording = useCallback(async (): Promise<void> => {
    if (activeTest?.url) {
      await window.api.loadUrlRequest(activeTest.url)
      window.api.startRecordingMain()
    }
  }, [activeTest])

  const handleStopRecording = useCallback((): void => {
    window.api.stopRecordingMain()
  }, [])

  const handleSaveTest = useCallback((): void => {
    if (activeSuiteId && activeTest?.name) {
      window.api.saveTest(activeSuiteId, activeTest)
    }
  }, [activeSuiteId, activeTest])

  const handleRunTest = useCallback(async (): Promise<void> => {
    if (activeSuiteId && activeTest?.id) {
      await handleSaveTest()
      setIsRunning(true)
      setRunOutput(`Running test: ${activeTest.name}...`)
      const result = await window.api.runTest(activeSuiteId, activeTest.id)
      setRunOutput(result.output)
      setIsRunning(false)
    }
  }, [activeSuiteId, activeTest, handleSaveTest])

  const handleReorderTests = useCallback((suiteId: string, reorderedTests: Test[]) => {
    setSuites((prevSuites) =>
      prevSuites.map((suite) => {
        if (suite.id === suiteId) {
          return { ...suite, tests: reorderedTests }
        }
        return suite
      })
    )
    // window.api.reorderTests(suiteId, reorderedTests);
  }, [])

  const handleRunAllTests = useCallback(async (suiteId: string) => {
    const suiteToRun = suites.find((s) => s.id === suiteId);
    if (suiteToRun) {
      await handleSaveTest();
      setIsRunning(true);
      setRunOutput(`Running suite: ${suiteToRun.name}...`);
      const result = await window.api.runSuite(suiteToRun.id);
      setRunOutput(result.output);
      setIsRunning(false);
    }
  }, [suites, handleSaveTest]);

  const handleExportTest = useCallback(async (): Promise<void> => {
    if (activeTest?.steps && activeTest.steps.length > 0) {
      const result = await window.api.exportTest(activeTest.name, activeTest.steps);
      if (result.success) {
        setRunOutput(`Test exported successfully to ${result.path}`);
      } else if (result.error) {
        setRunOutput(`Export failed: ${result.error}`);
      }
    } else {
      setRunOutput('There are no steps to export.');
    }
  }, [activeTest]);

  // This effect should only run ONCE to set up listeners.
  useEffect(() => {
    window.api.getSuites().then((initialSuites) => {
      setSuites(initialSuites);
      if (initialSuites.length > 0) {
        const firstSuite = initialSuites[0];
        setActiveSuiteId(firstSuite.id);
        setActiveTest(firstSuite.tests[0] ?? null);
      }
    });

    const suiteUpdatedCleanup = window.electron.ipcRenderer.on(
      'suite-updated',
      (_event, updatedSuites: Suite[]) => {
        // Use a functional update for `setSuites` to safely access the previous state
        setSuites(prevSuites => {
          // Check if a suite has been added
          if (updatedSuites.length > prevSuites.length) {
            const newSuite = updatedSuites.find(s => !prevSuites.some(ps => ps.id === s.id));
            if (newSuite) {
              // A new suite was added, so select it.
              setActiveSuiteId(newSuite.id);
              setActiveTest(newSuite.tests[0] ?? null);
            }
          } else {
            // This is not a new suite creation, so handle other updates like test deletion
            const currentSuiteId = activeSuiteIdRef.current;
            const currentTest = activeTestRef.current;
            const activeSuiteNow = updatedSuites.find(s => s.id === currentSuiteId);

            if (activeSuiteNow && currentTest && !activeSuiteNow.tests.find(t => t.id === currentTest.id)) {
              setActiveTest(activeSuiteNow.tests[0] ?? null);
            }
          }
          // Return the new state for React to set
          return updatedSuites;
        });
      }
    );

    const handleRecordingStarted = (_event: any, loadedUrl: string): void => {
      setIsRecording(true);
      const currentTest = activeTestRef.current;
      if (currentTest) {
        setActiveTest({ ...currentTest, steps: [`@driver.get("${loadedUrl}")`] });
      }
      setRunOutput('');
    };

    const handleRecordingStopped = () => setIsRecording(false);

    const handleNewCommand = (_event: any, command: string): void => {
      const currentTest = activeTestRef.current;
      if (currentTest) {
        setActiveTest(prevTest => prevTest ? { ...prevTest, steps: [...prevTest.steps, command] } : null);
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
    <div className="flex flex-col h-screen w-screen p-4 space-y-4 bg-gray-50">
      {/* --- Top Section --- */}
      <div className="flex-none pb-1 pr-1">
        <div className="relative">
          <div className="relative flex flex-col border border-black rounded-lg bg-white z-10 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">
                {activeSuite ? `Suite: ${activeSuite.name}` : 'No Suite Selected'}
              </h2>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex-1">
                <InputField
                  value={activeTest?.name ?? ''}
                  onChange={(e) => setActiveTest((p) => (p ? { ...p, name: e.target.value } : null))}
                  placeholder="Test Name"
                  disabled={!activeTest}
                />
              </div>
              <div className="flex-1">
                <InputField
                  value={activeTest?.url ?? ''}
                  onChange={(e) => setActiveTest((p) => (p ? { ...p, url: e.target.value } : null))}
                  placeholder="URL to Record"
                  disabled={!activeTest}
                />
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-gray-200 pt-4">
              <div className="flex items-center space-x-2">
                <Button onClick={handleStartRecording} disabled={!activeTest || isRecording} type={isRecording ? 'disabled' : 'primary'}>Record</Button>
                <Button onClick={handleRunTest} disabled={!activeTest || isRecording || isRunning} type={!activeTest || isRecording || isRunning ? 'disabled' : 'success'}>Run</Button>
                <Button onClick={handleStopRecording} disabled={!isRecording} type={!isRecording ? 'disabled' : 'secondary'}>Stop</Button>
              </div>
              <div className="flex items-center space-x-2">
                <Button onClick={handleSaveTest} disabled={!activeTest || isRecording} type={!activeTest || isRecording ? 'disabled' : 'primary'}>Save Test</Button>
                <Button onClick={handleNewTest} disabled={!activeSuiteId} type={!activeSuiteId ? 'disabled' : 'secondary'}>New Test</Button>
                <Button onClick={handleExportTest} disabled={!activeTest || isRecording} type={!activeTest || isRecording ? 'disabled' : 'secondary'}>Export Script</Button>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* --- Bottom Panels --- */}
      <div className="flex-1 flex flex-row space-x-4">
        {/* Panel 1: Test Suites */}
        <div className="w-1/4 flex flex-col space-y-2">
          <h3 className="px-1 text-lg font-semibold text-gray-800">Test Suites</h3>
          <div className="flex-1 pb-1 pr-1">
            <StyledPanel>
              <TestSuitePanel
                suites={suites}
                activeSuiteId={activeSuiteId}
                activeTestId={activeTest?.id ?? null}
                onSuiteChange={handleSuiteChange}
                onTestSelect={handleTestSelect}
                onCreateSuite={handleCreateSuite}
                onDeleteSuite={handleDeleteSuite}
                onTestDelete={handleTestDelete}
                onRunAllTests={handleRunAllTests}
                onReorderTests={handleReorderTests}
              />
            </StyledPanel>
          </div>
        </div>
        {/* Panel 2: Recorded Steps */}
        <div className="w-1/2 flex flex-col space-y-2">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-lg font-semibold text-gray-800">Recorded Steps</h3>
          </div>
          <div className="flex-1 pb-1 pr-1">
            <StyledPanel>
              <CommandList
                steps={activeTest?.steps ?? []}
                setSteps={(newSteps) => setActiveTest((p) => (p ? { ...p, steps: newSteps } : null))}
                onDeleteStep={(indexToDelete) => setActiveTest((p) => p ? { ...p, steps: p.steps.filter((_, i) => i !== indexToDelete) } : null)}
                showParsedText={showParsedText}
              />
            </StyledPanel>
          </div>
        </div>
        {/* Panel 3: Run Output */}
        <div className="w-1/3 flex flex-col space-y-2">
          <h3 className="px-1 text-lg font-semibold text-gray-800">Run Output</h3>
          <div className="flex-1 pb-1 pr-1">
            <StyledPanel>
              <OutputPanel output={runOutput} />
            </StyledPanel>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Recorder
