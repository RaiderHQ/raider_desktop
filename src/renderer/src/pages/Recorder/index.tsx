import React, { useState, useEffect, useCallback, useRef, SetStateAction } from 'react'
import CommandList from '@components/CommandList'
import TestSuitePanel from '@components/TestSuitePanel'
import OutputPanel from '@components/OutputPanel'
import MainRecorderPanel from '@components/MainRecorderPanel'
import StyledPanel from '@components/StyledPanel'
import { Toaster, toast } from 'react-hot-toast'
import type { Suite } from '@foundation/Types/suite'
import type { Test } from '@foundation/Types/test'
import AssertionTextModal from '@components/AssertionTextModal'
import RubyInstallModal from '@components/RubyInstallModal'
import useProjectStore from '@foundation/Stores/projectStore'
import useRubyStore from '@foundation/Stores/rubyStore'
import useRunOutputStore from '@foundation/Stores/runOutputStore'
import Button from '@components/Button'

import DeleteModal from '@components/DeleteModal'

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
  const { runOutput, setRunOutput } = useRunOutputStore()
  const [isRunning, setIsRunning] = useState<boolean>(false)
  const [assertionInfo, setAssertionInfo] = useState<AssertionInfo | null>(null)
  const [isRubyInstallModalOpen, setIsRubyInstallModalOpen] = useState<boolean>(false)
  const [missingGems, setMissingGems] = useState<string[] | undefined>(undefined)
  const { rubyCommand, setRubyCommand } = useRubyStore()
  const projectPath = useProjectStore((state) => state.projectPath)
  const [isOutputVisible, setIsOutputVisible] = useState<boolean>(false)
  const [showCode, setShowCode] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false)
  const [testToDelete, setTestToDelete] = useState<Test | null>(null)

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

  const handleAutoSave = useCallback(() => {
    if (activeSuiteIdRef.current && activeTestRef.current) {
      window.api.saveRecording(activeSuiteIdRef.current, activeTestRef.current)
    }
  }, [])

  useEffect(() => {
    const handler = setTimeout(() => {
      handleAutoSave()
    }, 500) // Debounce time

    return () => {
      clearTimeout(handler)
    }
  }, [activeTest])

  /**
   * Determines the correct locator strategy (:id, :css, :xpath) based on the selector string.
   * @param selector The selector string from the preload script.
   * @returns An object with the strategy and the processed selector value.
   */
  const formatLocator = (selector: string): { strategy: string; value: string } => {
    // Check for XPath (starts with / or (//)
    if (selector.startsWith('/') || selector.startsWith('(')) {
      return { strategy: 'xpath', value: selector }
    }
    // Check for a simple ID selector (e.g., #my-id) that isn't part of a complex path
    if (selector.startsWith('#') && !/[\s>~+]/.test(selector)) {
      return { strategy: 'id', value: selector.substring(1) }
    }
    // Default to CSS for all other cases
    return { strategy: 'css', value: selector }
  }

  const handleCreateSuite = useCallback(
    (suiteName: string): void => {
      if (suiteName && !suites.find((s) => s.name === suiteName)) {
        window.api.createSuite(suiteName)
      }
    },
    [suites]
  )

  const handleDeleteSuite = useCallback((suiteIdToDelete: string): void => {
    window.api.deleteSuite(suiteIdToDelete)
  }, [])

  const handleTestDeleteRequest = useCallback((test: Test) => {
    setTestToDelete(test)
    setIsDeleteModalOpen(true)
  }, [])

  const handleConfirmDelete = useCallback(() => {
    if (activeSuiteId && testToDelete) {
      window.api.deleteTest(activeSuiteId, testToDelete.id)
    }
    setIsDeleteModalOpen(false)
    setTestToDelete(null)
  }, [activeSuiteId, testToDelete])

  const handleSuiteChange = (suiteId: string): void => {
    setActiveSuiteId(suiteId)
    const suite = suites.find((s) => s.id === suiteId)
    setActiveTest(suite?.tests[0] ?? null)
  }

  const handleTestSelect = (testId: string): void => {
    const test = activeSuite?.tests.find((t) => t.id === testId)
    if (test) {
      setActiveTest(test)
    }
  }

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
    console.log('handleRunTest called')
    if (activeSuiteId && activeTest?.id && rubyCommand) {
      console.log('Running test with:', {
        activeSuiteId,
        activeTestId: activeTest.id,
        projectPath,
        rubyCommand
      })
      setIsRunning(true)
      setRunOutput(`Running test: ${activeTest.name}...`)
      const result = await window.api.runTest(
        activeSuiteId,
        activeTest.id,
        projectPath || '.',
        rubyCommand
      )
      setRunOutput(result.output)
      setIsRunning(false)
    } else {
      console.log('handleRunTest conditions not met:', {
        activeSuiteId,
        activeTest,
        projectPath,
        rubyCommand
      })
    }
  }, [activeSuiteId, activeTest, projectPath, rubyCommand])

  const handleRunAllTests = useCallback(
    async (suiteId: string) => {
      console.log('handleRunAllTests called')
      const suiteToRun = suites.find((s) => s.id === suiteId)
      if (suiteToRun && rubyCommand) {
        console.log('Running suite with:', { suiteId, projectPath, rubyCommand })
        setIsRunning(true)
        setRunOutput(`Running suite: ${suiteToRun.name}...`)
        const result = await window.api.runSuite(suiteToRun.id, projectPath || '.', rubyCommand)
        setRunOutput(result.output)
        setIsRunning(false)
      } else {
        console.log('handleRunAllTests conditions not met:', {
          suiteToRun,
          projectPath,
          rubyCommand
        })
      }
    },
    [suites, projectPath, rubyCommand, setRunOutput]
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

  const handleExportSuite = useCallback(async (): Promise<{
    success: boolean
    path?: string
    error?: string
  }> => {
    if (activeSuiteId) {
      return window.api.exportSuite(activeSuiteId)
    } else {
      return { success: false, error: 'There is no active suite to export.' }
    }
  }, [activeSuiteId])

  const handleExportProject = useCallback(async (): Promise<{
    success: boolean
    path?: string
    error?: string
  }> => {
    return window.api.exportProject()
  }, [])

  const handleImportTest = useCallback(async (): Promise<{
    success: boolean
    test?: Test
    error?: string
  }> => {
    if (activeSuiteId) {
      return window.api.importTest(activeSuiteId)
    } else {
      return { success: false, error: 'There is no active suite to import the test into.' }
    }
  }, [activeSuiteId])

  const handleImportSuite = useCallback(async (): Promise<{
    success: boolean
    suite?: Suite
    error?: string
  }> => {
    return window.api.importSuite()
  }, [])

  const handleImportProject = useCallback(async (): Promise<{
    success: boolean
    error?: string
  }> => {
    return window.api.importProject()
  }, [])

  const handleSaveAssertionText = (expectedText: string): void => {
    if (assertionInfo) {
      const { strategy, value } = formatLocator(assertionInfo.selector)
      const newStep = `expect(@driver.find_element(:${strategy}, "${value}").text).to eq("${expectedText}")`
      setActiveTest((prevTest) =>
        prevTest ? { ...prevTest, steps: [...prevTest.steps, newStep] } : null
      )
    }
    setAssertionInfo(null)
  }

  const handleCloseAssertionModal = (): void => {
    setAssertionInfo(null)
  }

  const handleInstallRuby = async () => {
    console.log('handleInstallRuby called')
    setIsRubyInstallModalOpen(false)
    // Show a toast notification that the installation is in progress
    const toastId = toast.loading('Installing Ruby and dependencies...')

    try {
      const result = await window.api.installRbenvAndRuby()
      console.log('installRbenvAndRuby result:', result)
      if (result.success) {
        const rubyCheck = await window.api.isRubyInstalled()
        if (rubyCheck.success && rubyCheck.rubyCommand) {
          setRubyCommand(rubyCheck.rubyCommand)
          await window.api.installGems(rubyCheck.rubyCommand, ['ruby_raider'])
          await window.api.installGems(rubyCheck.rubyCommand, [
            'selenium-webdriver',
            'rspec',
            'allure-rspec'
          ])
          toast.success('Installation successful!', { id: toastId })
        } else {
          toast.error(`Installation failed: ${rubyCheck.error}`, { id: toastId })
        }
      } else {
        toast.error(`Installation failed: ${result.error}`, { id: toastId })
      }
    } catch (error) {
      toast.error(`An error occurred during installation: ${error}`, { id: toastId })
    }
  }

  const handleInstallGems = async () => {
    console.log('handleInstallGems called')
    setIsRubyInstallModalOpen(false)
    const toastId = toast.loading(`Installing missing gems: ${missingGems?.join(', ')}...`)

    try {
      const result = await window.api.installGems(rubyCommand!, missingGems!)
      console.log('installGems result:', result)
      if (result.success) {
        toast.success('Gems installed successfully!', { id: toastId })
      } else {
        toast.error(`Gem installation failed: ${result.error}`, { id: toastId })
      }
    } catch (error) {
      toast.error(`An error occurred during gem installation: ${error}`, { id: toastId })
    }
  }

  useEffect(() => {
    const checkRuby = async () => {
      console.log('Checking for Ruby...')
      const result = await window.api.isRubyInstalled()
      console.log('Ruby check result:', result)
      if (!result.success) {
        setMissingGems(result.missingGems)
        setRubyCommand(result.rubyCommand)
        setIsRubyInstallModalOpen(true)
      } else {
        setRubyCommand(result.rubyCommand)
      }
    }
    checkRuby()

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
            if (JSON.stringify(activeTestRef.current) !== JSON.stringify(activeTestNow)) {
              setActiveTest(activeTestNow)
            }
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

    const handleRecordingStarted = (_event: Electron.IpcRendererEvent, loadedUrl: string): void => {
      setIsRecording(true)
      const currentTest = activeTestRef.current
      if (currentTest) {
        setActiveTest({ ...currentTest, steps: [`@driver.get("${loadedUrl}")`] })
      }
      setRunOutput('')
    }

    const handleRecordingStopped = () => setIsRecording(false)

    const handleNewCommand = (_event: Electron.IpcRendererEvent, command: string): void => {
      setActiveTest((prevTest) =>
        prevTest ? { ...prevTest, steps: [...prevTest.steps, command] } : null
      )
    }

    const handleAddAssertion = (
      _event: Electron.IpcRendererEvent,
      assertion: { type: string; selector: string; text?: string }
    ): void => {
      let newStep = ''
      const { strategy, value } = formatLocator(assertion.selector)

      switch (assertion.type) {
        case 'wait-displayed':
          newStep = `@wait.until { @driver.find_element(:${strategy}, "${value}").displayed? }`
          setActiveTest((prev) => (prev ? { ...prev, steps: [...prev.steps, newStep] } : null))
          break
        case 'wait-enabled':
          newStep = `@wait.until { @driver.find_element(:${strategy}, "${value}").enabled? }`
          setActiveTest((prev) => (prev ? { ...prev, steps: [...prev.steps, newStep] } : null))
          break
        case 'displayed':
          newStep = `expect(@driver.find_element(:${strategy}, "${value}")).to be_displayed`
          setActiveTest((prev) => (prev ? { ...prev, steps: [...prev.steps, newStep] } : null))
          break
        case 'enabled':
          newStep = `expect(@driver.find_element(:${strategy}, "${value}")).to be_enabled`
          setActiveTest((prev) => (prev ? { ...prev, steps: [...prev.steps, newStep] } : null))
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
      {isRubyInstallModalOpen && (
        <RubyInstallModal
          onInstall={missingGems ? handleInstallGems : handleInstallRuby}
          onClose={() => setIsRubyInstallModalOpen(false)}
          missingGems={missingGems}
        />
      )}
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
        onNewTest={handleNewTest}
        onExportTest={handleExportTest}
        onExportSuite={handleExportSuite}
        onExportProject={handleExportProject}
        onImportTest={handleImportTest}
        onImportSuite={handleImportSuite}
        onImportProject={handleImportProject}
        activeSuiteId={activeSuiteId}
      />
      <div className="flex-1 flex flex-row space-x-4">
        <div className={`${isOutputVisible ? 'w-1/4' : 'w-1/3'} flex flex-col space-y-2 transition-all duration-300`}>
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
                onTestDeleteRequest={handleTestDeleteRequest}
                onRunAllTests={handleRunAllTests}
                onReorderTests={() => {}}
              />
            </StyledPanel>
          </div>
        </div>
        <div className={`${isOutputVisible ? 'w-1/2' : 'w-2/3'} flex flex-col space-y-2 transition-all duration-300`}>
          <h3 className="px-1 text-lg font-semibold text-gray-800">Recorded Steps</h3>
          <div className="flex-1 pb-1 pr-1">
            <StyledPanel>
              <div className="flex justify-between items-center p-1 border-b border-gray-200">
                <Button onClick={() => setShowCode(!showCode)} type="secondary">
                  {showCode ? 'Friendly View' : 'Code View'}
                </Button>
                <Button onClick={() => setIsOutputVisible(!isOutputVisible)} type="secondary">
                  {isOutputVisible ? 'Hide Output' : 'Test Output'}
                </Button>
              </div>
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
                showCode={showCode}
              />
            </StyledPanel>
          </div>
        </div>
        {isOutputVisible && (
          <div className="w-1/3 flex flex-col space-y-2 transition-all duration-300">
            <h3 className="px-1 text-lg font-semibold text-gray-800">Run Output</h3>
            <div className="flex-1 pb-1 pr-1">
              <StyledPanel>
                <OutputPanel output={runOutput} />
              </StyledPanel>
            </div>
          </div>
        )}
      </div>
      {assertionInfo && (
        <AssertionTextModal
          initialText={assertionInfo.text}
          onSave={handleSaveAssertionText}
          onClose={handleCloseAssertionModal}
        />
      )}
      {isDeleteModalOpen && testToDelete && (
        <DeleteModal
          testName={testToDelete.name}
          onConfirm={handleConfirmDelete}
          onCancel={() => setIsDeleteModalOpen(false)}
        />
      )}
    </div>
  )
}

export default Recorder
