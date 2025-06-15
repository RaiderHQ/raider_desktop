import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import Button from '@components/Button'
import CommandList from '@components/CommandList'
import TestSuitePanel from '@components/TestSuitePanel'
import OutputPanel from '@components/OutputPanel'
import InputField from '@components/InputField'

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

/**
 * Creates a new, blank test object.
 */
const createNewTest = (): Test => ({
  id: crypto.randomUUID(), // Uses the browser's built-in crypto
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

  const StyledPanel: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    return (
      <div className="relative w-full h-full">
        {/* The red shadow div, offset from the top-left */}
        {/* The main content div with border, which sits on top */}
        <div className="relative w-full h-full flex flex-col border border-black rounded-lg bg-white z-10 overflow-y-auto p-4">
          {children}
        </div>
      </div>
    )
  }

  // --- Refs ---
  // This ref is the key to fixing the unresponsive UI.
  // It always holds the latest version of activeTest for our IPC listeners.
  const activeTestRef = useRef(activeTest)
  useEffect(() => {
    activeTestRef.current = activeTest
  }, [activeTest])

  const activeSuite = React.useMemo(
    () => suites.find((s) => s.id === activeSuiteId),
    [suites, activeSuiteId]
  )

  // --- UI and State Handlers ---

  const handleCreateSuite = useCallback(
    (suiteName: string) => {
      if (suiteName && !suites.find((s) => s.name === suiteName)) {
        window.api.createSuite(suiteName)
      }
    },
    [suites]
  )

  const handleDeleteSuite = useCallback(
    (suiteIdToDelete: string) => {
      // Add a confirmation dialog for destructive actions
      if (window.confirm('Are you sure you want to delete this suite and all its tests?')) {
        window.api.deleteSuite(suiteIdToDelete).then(() => {
          if (activeSuiteId === suiteIdToDelete) {
            setActiveSuiteId(null)
            setActiveTest(null)
          }
        })
      }
    },
    [activeSuiteId]
  )

  const handleSuiteChange = (suiteId: string) => {
    setActiveSuiteId(suiteId)
    const suite = suites.find((s) => s.id === suiteId)
    // When a suite is selected, pick its first test, or set to null if empty
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
      // Set as active test so the user can edit the name and URL
      setActiveTest(newTest)
      // Immediately save it to create the entry in the backend. The user can save again later.
      window.api.saveTest(activeSuiteId, newTest)
    }
  }

  // --- Backend Communication Handlers ---

  const handleStartRecording = useCallback(async (): Promise<void> => {
    if (activeTest?.url) {
      // Set the URL in the main process right before opening the window
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
      await handleSaveTest() // Always save latest changes before running
      setIsRunning(true)
      setRunOutput(`Running test: ${activeTest.name}...`)
      const result = await window.api.runTest(activeSuiteId, activeTest.id)
      setRunOutput(result.output)
      setIsRunning(false)
    }
  }, [activeSuiteId, activeTest, handleSaveTest])

  // NEW: Handler to update the order of tests within a suite
  const handleReorderTests = useCallback((suiteId: string, reorderedTests: Test[]) => {
    setSuites((prevSuites) =>
      prevSuites.map((suite) => {
        if (suite.id === suiteId) {
          // Return the suite with the newly ordered tests
          return { ...suite, tests: reorderedTests }
        }
        return suite
      })
    )
    // Note: To persist this change, you would also make an IPC call here
    // to update the suite in the main process.
  }, [])

  const handleRunAllTests = useCallback(
    async (suiteId: string) => {
      const suiteToRun = suites.find((s) => s.id === suiteId)
      if (suiteToRun) {
        // First save any pending changes to the currently active test
        await handleSaveTest()
        setIsRunning(true)
        setRunOutput(`Running suite: ${suiteToRun.name}...`)
        // Call the new backend API for running a suite
        const result = await window.api.runSuite(suiteId)
        setRunOutput(result.output)
        setIsRunning(false)
      }
    },
    [suites, handleSaveTest]
  )

  // --- Side Effects ---
  useEffect(() => {
    // This effect runs only ONCE to set up all IPC listeners.

    window.api.getSuites().then((initialSuites) => {
      setSuites(initialSuites)
      if (initialSuites.length > 0) {
        const firstSuite = initialSuites[0]
        setActiveSuiteId(firstSuite.id)
        setActiveTest(firstSuite.tests[0] ?? null)
      }
    })

    const suiteUpdatedCleanup = window.electron.ipcRenderer.on(
      'suite-updated',
      (_event, updatedSuites) => {
        setSuites(updatedSuites)
      }
    )

    const handleRecordingStarted = (_event: any, loadedUrl: string): void => {
      setIsRecording(true)
      // Use the ref here to get the current test and reset its steps
      const currentTest = activeTestRef.current
      if (currentTest) {
        setActiveTest({ ...currentTest, steps: [`@driver.get("${loadedUrl}")`] })
      }
      setRunOutput('')
    }
    const handleRecordingStopped = () => setIsRecording(false)

    const handleNewCommand = (_event: any, command: string): void => {
      // By using the ref, we get the LATEST activeTest state and append the new command,
      // which prevents the infinite loop.
      const currentTest = activeTestRef.current
      if (currentTest) {
        setActiveTest({ ...currentTest, steps: [...currentTest.steps, command] })
      }
    }

    const startCleanup = window.electron.ipcRenderer.on('recording-started', handleRecordingStarted)
    const stopCleanup = window.electron.ipcRenderer.on('recording-stopped', handleRecordingStopped)
    const commandCleanup = window.electron.ipcRenderer.on('new-recorded-command', handleNewCommand)

    return () => {
      suiteUpdatedCleanup?.()
      startCleanup?.()
      stopCleanup?.()
      commandCleanup?.()
    }
  }, []) // The empty dependency array [] is crucial.

  return (
    <div className="flex flex-col h-screen w-screen p-4 space-y-4 bg-gray-50">
      {/* --- Top Section (Full Width) --- */}
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
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* --- Bottom Panels --- */}
      <div className="flex-1 flex flex-row space-x-4">
        {/* Panel 1: Test Suites */}
        <div className="w-1/3 flex flex-col space-y-2">
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
                onReorderTests={handleReorderTests}
                onRunAllTests={handleRunAllTests}
              />
            </StyledPanel>
          </div>
        </div>

        {/* Panel 2: Recorded Steps */}
        <div className="w-1/3 flex flex-col space-y-2">
          <h3 className="px-1 text-lg font-semibold text-gray-800">Recorded Steps</h3>
          <div className="flex-1 pb-1 pr-1">
            <StyledPanel>
              <CommandList
                steps={activeTest?.steps ?? []}
                setSteps={(newSteps) =>
                  setActiveTest((p) => (p ? { ...p, steps: newSteps } : null))
                }
                onDeleteStep={(indexToDelete) =>
                  setActiveTest((p) =>
                    p ? { ...p, steps: p.steps.filter((_, i) => i !== indexToDelete) } : null
                  )
                }
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
