import React, { useState, useEffect, useCallback, useRef, SetStateAction } from 'react'
import CommandList from '@components/CommandList'
import TestSuitePanel from '@components/TestSuitePanel'
import OutputPanel from '@components/OutputPanel'
import MainRecorderPanel from '@components/MainRecorderPanel'
import StyledPanel from '@components/StyledPanel'
import { Toaster } from 'react-hot-toast'
import type { Suite } from '@foundation/Types/suite'
import type { Test } from '@foundation/Types/test'
import AssertionTextModal from '@components/AssertionTextModal'

// Defines the structure for the data needed by the assertion modal
interface AssertionInfo {
  selector: string
  text: string
}

const createNewTest = (): Test => ({
  id: crypto.randomUUID(),
  name: 'Untitled Test',
  url: 'https://www.wikipedia.org',
  steps: []
})

const Recorder: React.FC = () => {
  const [suites, setSuites] = useState<Suite[]>([])
  const [activeSuiteId, setActiveSuiteId] = useState<string | null>(null)
  const [activeTest, setActiveTest] = useState<Test | null>(null)
  const [isRecording, setIsRecording] = useState<boolean>(false)
  const [runOutput, setRunOutput] = useState<string>('')
  const [isRunning, setIsRunning] = useState<boolean>(false)
  const [assertionInfo, setAssertionInfo] = useState<AssertionInfo | null>(null)

  const activeTestRef = useRef(activeTest)
  useEffect(() => {
    activeTestRef.current = activeTest
  }, [activeTest])

  const activeSuiteIdRef = useRef(activeSuiteId)
  useEffect(() => {
    activeSuiteIdRef.current = activeSuiteId
  }, [activeSuiteId])

  const suitesRef = useRef(suites)
  useEffect(() => {
    suitesRef.current = suites
  }, [suites])

  const activeSuite = React.useMemo(
    () => suites.find((s) => s.id === activeSuiteId),
    [suites, activeSuiteId]
  )

  const handleCreateSuite = useCallback(
    (suiteName: string) => {
      if (suiteName && !suites.find((s) => s.name === suiteName)) {
        window.api.createSuite(suiteName)
      }
    },
    [suites]
  )

  const handleDeleteSuite = useCallback((suiteIdToDelete: string) => {
    if (window.confirm('Are you sure you want to delete this suite?')) {
      window.api.deleteSuite(suiteIdToDelete)
    }
  }, [])

  const handleTestDelete = useCallback(
    (testIdToDelete: string) => {
      if (activeSuiteId) {
        window.api.deleteTest(activeSuiteId, testIdToDelete)
      }
    },
    [activeSuiteId]
  )

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

  const handleSaveRecording = useCallback(() => {
    if (activeSuiteId && activeTest) {
      window.api.saveRecording(activeSuiteId, activeTest)
    }
  }, [activeSuiteId, activeTest])

  const handleNewTest = () => {
    if (activeSuiteId) {
      const newTest = createNewTest()
      setActiveTest(newTest)
      window.api.saveRecording(activeSuiteId, newTest)
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

  const handleRunTest = useCallback(async (): Promise<void> => {
    if (activeSuiteId && activeTest?.id) {
      handleSaveRecording()
      setIsRunning(true)
      setRunOutput(`Running test: ${activeTest.name}...`)
      const result = await window.api.runTest(activeSuiteId, activeTest.id)
      setRunOutput(result.output)
      setIsRunning(false)
    }
  }, [activeSuiteId, activeTest, handleSaveRecording])

  const handleRunAllTests = useCallback(
    async (suiteId: string) => {
      const suiteToRun = suites.find((s) => s.id === suiteId)
      if (suiteToRun) {
        handleSaveRecording()
        setIsRunning(true)
        setRunOutput(`Running suite: ${suiteToRun.name}...`)
        const result = await window.api.runSuite(suiteToRun.id)
        setRunOutput(result.output)
        setIsRunning(false)
      }
    },
    [suites, handleSaveRecording]
  )

  const handleExportTest = useCallback(async (): Promise<{
    success: boolean
    path?: string
    error?: string
  }> => {
    if (activeTest?.steps && activeTest.steps.length > 0) {
      return window.api.exportTest(activeTest.name, activeTest.steps)
    } else {
      return { success: false, error: 'There are no steps to export.' }
    }
  }, [activeTest])

  const handleSaveAssertionText = (expectedText: string): void => {
    if (assertionInfo) {
      const newStep = `expect(@driver.find_element(:css, "${assertionInfo.selector}").text).to eq("${expectedText}")`
      setActiveTest((prevTest) =>
        prevTest ? { ...prevTest, steps: [...prevTest.steps, newStep] } : null
      )
    }
    setAssertionInfo(null)
  }

  const handleCloseAssertionModal = (): void => {
    setAssertionInfo(null)
  }

  useEffect(() => {
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
      (_event, updatedSuites: Suite[]) => {
        const previousSuites = suitesRef.current
        const currentSuiteId = activeSuiteIdRef.current
        const currentTestId = activeTestRef.current?.id

        setSuites(updatedSuites)

        if (updatedSuites.length > previousSuites.length) {
          const newSuite = updatedSuites.find((s) => !previousSuites.some((ps) => ps.id === s.id))
          if (newSuite) {
            setActiveSuiteId(newSuite.id)
            setActiveTest(newSuite.tests[0] ?? null)
            return
          }
        }

        const activeSuiteNow = updatedSuites.find((s) => s.id === currentSuiteId)

        if (activeSuiteNow) {
          const activeTestNow = activeSuiteNow.tests.find((t) => t.id === currentTestId)
          if (activeTestNow) {
            setActiveTest(activeTestNow)
          } else {
            setActiveTest(activeSuiteNow.tests[0] ?? null)
          }
        } else if (currentSuiteId) {
          const firstSuite = updatedSuites[0] ?? null
          setActiveSuiteId(firstSuite?.id ?? null)
          setActiveTest(firstSuite?.tests[0] ?? null)
        }
      }
    )

    const handleRecordingStarted = (_event: any, loadedUrl: string): void => {
      setIsRecording(true)
      const currentTest = activeTestRef.current
      if (currentTest) {
        setActiveTest({ ...currentTest, steps: [`@driver.get("${loadedUrl}")`] })
      }
      setRunOutput('')
    }

    const handleRecordingStopped = () => setIsRecording(false)

    const handleNewCommand = (_event: any, command: string): void => {
      setActiveTest((prevTest) =>
        prevTest ? { ...prevTest, steps: [...prevTest.steps, command] } : null
      )
    }

    const handleAddAssertion = (
      _event: any,
      assertion: { type: string; selector: string; text?: string }
    ): void => {
      let newStep = ''
      switch (assertion.type) {
        case 'displayed':
          newStep = `expect(@driver.find_element(:css, "${assertion.selector}")).to be_displayed`
          setActiveTest((prev) => (prev ? { ...prev, steps: [...prev.steps, newStep] } : null))
          break
        case 'enabled':
          newStep = `expect(@driver.find_element(:css, "${assertion.selector}")).to be_enabled`
          setActiveTest((prev) => (prev ? { ...prev, steps: [...prev.steps, newStep] } : null))
          break
        case 'text':
          setAssertionInfo({ selector: assertion.selector, text: assertion.text ?? '' })
          break
      }
    }

    const startCleanup = window.electron.ipcRenderer.on('recording-started', handleRecordingStarted)
    const stopCleanup = window.electron.ipcRenderer.on('recording-stopped', handleRecordingStopped)
    const commandCleanup = window.electron.ipcRenderer.on(
      'new-recorded-command',
      handleNewCommand
    )
    const assertionCleanup = window.electron.ipcRenderer.on('add-assertion-step', handleAddAssertion)

    return () => {
      suiteUpdatedCleanup?.()
      startCleanup?.()
      stopCleanup?.()
      commandCleanup?.()
      assertionCleanup?.()
    }
  }, [])

  return (
    <div className="flex flex-col h-screen w-screen p-4 space-y-4 bg-gray-50">
      <Toaster />
      <MainRecorderPanel
        activeSuiteName={activeSuite?.name}
        activeTest={activeTest}
        isRecording={isRecording}
        isRunning={isRunning}
        onTestNameChange={(e) => setActiveTest((p) => (p ? { ...p, name: e.target.value } : null))}
        onUrlChange={(e) => setActiveTest((p) => (p ? { ...p, url: e.target.value } : null))}
        onStartRecording={handleStartRecording}
        onRunTest={handleRunTest}
        onStopRecording={handleStopRecording}
        onSaveTest={handleSaveRecording}
        onNewTest={handleNewTest}
        onExportTest={handleExportTest}
        activeSuiteId={activeSuiteId}
      />
      <div className="flex-1 flex flex-row space-x-4">
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
                onReorderTests={() => {}}
              />
            </StyledPanel>
          </div>
        </div>
        <div className="w-1/2 flex flex-col space-y-2">
          <h3 className="px-1 text-lg font-semibold text-gray-800">Recorded Steps</h3>
          <div className="flex-1 pb-1 pr-1">
            <StyledPanel>
              <CommandList
                steps={activeTest?.steps ?? []}
                setSteps={(newSteps: SetStateAction<string[]>) =>
                  setActiveTest((prevTest) => {
                    if (!prevTest) return null
                    const updatedSteps =
                      typeof newSteps === 'function' ? newSteps(prevTest.steps) : newSteps
                    return { ...prevTest, steps: updatedSteps }
                  })
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
        <div className="w-1/3 flex flex-col space-y-2">
          <h3 className="px-1 text-lg font-semibold text-gray-800">Run Output</h3>
          <div className="flex-1 pb-1 pr-1">
            <StyledPanel>
              <OutputPanel output={runOutput} />
            </StyledPanel>
          </div>
        </div>
      </div>
      {assertionInfo && (
        <AssertionTextModal
          initialText={assertionInfo.text}
          onSave={handleSaveAssertionText}
          onClose={handleCloseAssertionModal}
        />
      )}
    </div>
  )
}

export default Recorder
