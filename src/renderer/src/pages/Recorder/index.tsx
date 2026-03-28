import React, { useState, useEffect, useCallback, useRef, SetStateAction } from 'react'
import CommandList from '@components/CommandList'
import TestSuitePanel from '@components/TestSuitePanel'
import OutputPanel from '@components/OutputPanel'
import MainRecorderPanel from '@components/MainRecorderPanel'
import StyledPanel from '@components/StyledPanel'
import type { Test } from '@foundation/Types/test'
import AssertionTextModal from '@components/AssertionTextModal'
import useProjectStore from '@foundation/Stores/projectStore'
import useRubyStore from '@foundation/Stores/rubyStore'
import useRunOutputStore from '@foundation/Stores/runOutputStore'
import useRecorderStore from '@foundation/Stores/recorderStore'
import { formatLocator } from '@foundation/recorderUtils'
import { useSuiteSync, useRecordingIPC } from '../../hooks/useRecorderIPC'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import DeleteModal from '@components/DeleteModal'
import RecordingDashboard from '@components/RecordingDashboard'


interface AssertionInfo {
  selector: string
  text: string
}

type RecorderTab = 'recording' | 'dashboard'

const Recorder: React.FC = (): JSX.Element => {
  const { t } = useTranslation()

  // Store state
  const suites = useRecorderStore((s) => s.suites)
  const activeSuiteId = useRecorderStore((s) => s.activeSuiteId)
  const activeTest = useRecorderStore((s) => s.activeTest)
  const showCode = useRecorderStore((s) => s.showCode)
  const isOutputVisible = useRecorderStore((s) => s.isOutputVisible)
  const {
    setActiveSuiteId,
    setActiveTest,
    updateActiveTest,
    setIsRunning,
    setShowCode,
    setIsOutputVisible
  } = useRecorderStore.getState()

  const { runOutput, setRunOutput } = useRunOutputStore()

  // Tab state
  const [activeTab, setActiveTab] = useState<RecorderTab>('recording')

  // Local modal state
  const [assertionInfo, setAssertionInfo] = useState<AssertionInfo | null>(null)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [testToDelete, setTestToDelete] = useState<Test | null>(null)

  // Embedded browser state
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null)
  const [preloadPath, setPreloadPath] = useState<string | null>(null)
  const webviewRef = useRef<Electron.WebviewTag | null>(null)

  // Recording settings state
  const [implicitWait, setImplicitWait] = useState(0)
  const [explicitWait, setExplicitWait] = useState(30)

  // IPC hooks
  useSuiteSync()
  useRecordingIPC({ setAssertionInfo })

  // Load recording settings on mount
  useEffect(() => {
    const savedImplicitWait = localStorage.getItem('implicitWait')
    if (savedImplicitWait) setImplicitWait(Number(savedImplicitWait))
    const savedExplicitWait = localStorage.getItem('explicitWait')
    if (savedExplicitWait) setExplicitWait(Number(savedExplicitWait))
  }, [])

  const handleImplicitWaitChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const val = Number(event.target.value)
    if (val >= 0) setImplicitWait(val)
  }

  const handleExplicitWaitChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const val = Number(event.target.value)
    if (val >= 0) setExplicitWait(val)
  }

  const handleUpdateSettings = async (): Promise<void> => {
    try {
      await window.api.updateRecordingSettings({ implicitWait, explicitWait })
      localStorage.setItem('implicitWait', implicitWait.toString())
      localStorage.setItem('explicitWait', explicitWait.toString())
    } catch (error) {
      toast.error(`${t('settings.recording.error.unexpected')} : ${error}`)
    }
  }

  // Auto-save debounce
  useEffect((): (() => void) => {
    const handler = setTimeout(() => {
      const { activeSuiteId: suiteId, activeTest: test } = useRecorderStore.getState()
      if (suiteId && test) {
        window.api.saveRecording(suiteId, test)
      }
    }, 500)
    return () => clearTimeout(handler)
  }, [activeTest])

  const activeSuite = React.useMemo(
    () => suites.find((s) => s.id === activeSuiteId),
    [suites, activeSuiteId]
  )

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

  const handleTestDeleteRequest = useCallback((test: Test): void => {
    setTestToDelete(test)
    setIsDeleteModalOpen(true)
  }, [])

  const handleConfirmDelete = useCallback((): void => {
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

  const handleStartRecording = useCallback(async (): Promise<void> => {
    const test = useRecorderStore.getState().activeTest
    if (test?.url) {
      await window.api.loadUrlRequest(test.url)
      const result = await window.api.startRecordingMain()
      if (result.success) {
        setRecordingUrl(result.url)
        setPreloadPath(result.preloadPath)
      }
    }
  }, [])

  const handleStopRecording = useCallback((): void => {
    setRecordingUrl(null)
    setPreloadPath(null)
    window.api.stopRecordingMain()
  }, [])

  const handleRunTest = useCallback(async (): Promise<void> => {
    const { activeSuiteId: suiteId, activeTest: test } = useRecorderStore.getState()
    const cmd = useRubyStore.getState().rubyCommand
    const path = useProjectStore.getState().projectPath
    if (suiteId && test?.id && cmd) {
      setIsRunning(true)
      setRunOutput(`Running test: ${test.name}...`)
      const result = await window.api.runTest(suiteId, test.id, path || '.', cmd)
      setRunOutput(result.output)
      setIsRunning(false)
    }
  }, [])

  const handleRunAllTests = useCallback(async (suiteId: string): Promise<void> => {
    const { suites: allSuites } = useRecorderStore.getState()
    const cmd = useRubyStore.getState().rubyCommand
    const path = useProjectStore.getState().projectPath
    const suiteToRun = allSuites.find((s) => s.id === suiteId)
    if (suiteToRun && cmd) {
      setIsRunning(true)
      setRunOutput(`Running suite: ${suiteToRun.name}...`)
      const result = await window.api.runSuite(suiteToRun.id, path || '', cmd)
      setRunOutput(result.output)
      setIsRunning(false)
    }
  }, [])

  const handleSaveAssertionText = (expectedText: string): void => {
    if (assertionInfo) {
      const { strategy, value } = formatLocator(assertionInfo.selector)
      const newStep = `expect(@driver.find_element(:${strategy}, ${value}).text).to eq("${expectedText}")`
      updateActiveTest((prev) => (prev ? { ...prev, steps: [...prev.steps, newStep] } : null))
    }
    setAssertionInfo(null)
  }

  const runStatus: 'pass' | 'fail' | null = React.useMemo(() => {
    if (!runOutput || runOutput.startsWith('Running')) return null
    if (/0 failures?/i.test(runOutput) || /\bpassed\b/i.test(runOutput)) return 'pass'
    if (/\d+ failures?/i.test(runOutput) || /\bfailed\b/i.test(runOutput)) return 'fail'
    return null
  }, [runOutput])

  return (
    <div className="flex flex-col h-screen w-screen p-4 space-y-4 bg-white">
      {/* Tab bar */}
      <div className="flex items-center border-b border-neutral-bdr">
        <button
          onClick={() => setActiveTab('recording')}
          className={`px-5 py-2 text-sm font-semibold transition-colors ${
            activeTab === 'recording'
              ? 'text-neutral-dark border-b-2 border-ruby'
              : 'text-neutral-mid hover:text-neutral-dk'
          }`}
        >
          {t('recorder.tabs.recording')}
        </button>
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`px-5 py-2 text-sm font-semibold transition-colors ${
            activeTab === 'dashboard'
              ? 'text-neutral-dark border-b-2 border-ruby'
              : 'text-neutral-mid hover:text-neutral-dk'
          }`}
        >
          {t('recorder.tabs.dashboard')}
        </button>
        {runStatus && (
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`ml-auto flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold text-white transition-opacity hover:opacity-80 ${
              runStatus === 'pass' ? 'bg-green-500' : 'bg-red-500'
            }`}
          >
            <span className="text-base leading-none">{runStatus === 'pass' ? '✓' : '✕'}</span>
            {runStatus === 'pass' ? 'Passed' : 'Failed'}
          </button>
        )}
      </div>

      {/* Recording tab */}
      {activeTab === 'recording' && (
        <div className="flex-1 flex flex-col min-h-0 space-y-4">
          <MainRecorderPanel
            onStartRecording={handleStartRecording}
            onRunTest={handleRunTest}
            onStopRecording={handleStopRecording}
          />

          {/* Inline wait settings */}
          <div className="flex items-center gap-4 px-1">
            <div className="flex items-center gap-2 text-sm text-neutral-mid">
              <label htmlFor="implicit-wait" className="font-medium whitespace-nowrap">
                {t('settings.recording.implicitWait.label')}
              </label>
              <input
                type="number"
                id="implicit-wait"
                value={implicitWait}
                onChange={handleImplicitWaitChange}
                onBlur={handleUpdateSettings}
                className="border border-neutral-bdr rounded px-2 py-1 w-16 text-sm"
                min="0"
              />
              <span className="text-xs">s</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-neutral-mid">
              <label htmlFor="explicit-wait" className="font-medium whitespace-nowrap">
                {t('settings.recording.explicitWait.label')}
              </label>
              <input
                type="number"
                id="explicit-wait"
                value={explicitWait}
                onChange={handleExplicitWaitChange}
                onBlur={handleUpdateSettings}
                className="border border-neutral-bdr rounded px-2 py-1 w-16 text-sm"
                min="0"
              />
              <span className="text-xs">s</span>
            </div>
          </div>

          {/* When recording: embedded browser + steps side by side */}
          {recordingUrl && preloadPath ? (
            <div className="flex-1 flex flex-row space-x-4 min-h-0">
              {/* Embedded browser */}
              <div className="w-[60%] flex flex-col min-h-0">
                <div className="flex-1 border border-neutral-bdr rounded-lg overflow-hidden bg-white">
                  <webview
                    ref={(el: HTMLElement | null) => {
                      const wv = el as unknown as Electron.WebviewTag | null
                      if (wv && wv !== webviewRef.current) {
                        webviewRef.current = wv
                        wv.addEventListener('dom-ready', () => {
                          const wcId = wv.getWebContentsId()
                          window.api.registerRecorderWebContents(wcId)
                        })
                      }
                    }}
                    src={recordingUrl}
                    preload={`file://${preloadPath}`}
                    style={{ width: '100%', height: '100%' }}
                  />
                </div>
              </div>
              {/* Recorded steps panel */}
              <div className="w-[40%] flex flex-col space-y-2">
                <h3 className="px-1 text-lg font-semibold text-neutral-dark">
                  {t('recorder.recorderPage.recordedSteps')}
                </h3>
                <div className="flex-1 min-h-0">
                  <StyledPanel>
                    <>
                      <div className="flex items-center p-1 border-b border-neutral-bdr">
                        <button
                          onClick={() => setShowCode(!showCode)}
                          className="text-xs px-2.5 py-1 rounded border border-neutral-bdr text-neutral-dk bg-white hover:bg-neutral-50 transition-colors font-medium"
                        >
                          {showCode
                            ? t('recorder.recorderPage.friendlyView')
                            : t('recorder.recorderPage.codeView')}
                        </button>
                      </div>
                      <CommandList
                        steps={activeTest?.steps ?? []}
                        setSteps={(newSteps: SetStateAction<string[]>) =>
                          updateActiveTest((prevTest) => {
                            if (!prevTest) return null
                            const updatedSteps =
                              typeof newSteps === 'function' ? newSteps(prevTest.steps) : newSteps
                            return { ...prevTest, steps: updatedSteps }
                          })
                        }
                        onDeleteStep={(indexToDelete) =>
                          updateActiveTest((p) =>
                            p
                              ? { ...p, steps: p.steps.filter((_, i) => i !== indexToDelete) }
                              : null
                          )
                        }
                        onEditStep={(editIndex, newCommand) =>
                          updateActiveTest((p) =>
                            p
                              ? {
                                  ...p,
                                  steps: p.steps.map((s, i) => (i === editIndex ? newCommand : s))
                                }
                              : null
                          )
                        }
                        showCode={showCode}
                      />
                    </>
                  </StyledPanel>
                </div>
              </div>
            </div>
          ) : (
            /* Normal view: suites + steps */
            <>
              <div className="flex-1 flex flex-row min-h-0">
                <div className="w-[30%] flex flex-col space-y-2 pr-4 border-r border-neutral-bdr">
                  <h3 className="px-1 text-lg font-semibold text-neutral-dark">
                    {t('recorder.recorderPage.testSuites')}
                  </h3>
                  <div className="flex-1 min-h-0">
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
                <div className="w-[70%] flex flex-col space-y-2 pl-4">
                  <h3 className="px-1 text-lg font-semibold text-neutral-dark">
                    {t('recorder.recorderPage.recordedSteps')}
                  </h3>
                  <div className="flex-1 min-h-0">
                    <StyledPanel>
                      {!activeTest && !activeSuiteId ? (
                        <div className="flex items-center justify-center h-full text-neutral-mid text-sm p-8 text-center">
                          {t('recorder.recorderPage.noSuiteSteps')}
                        </div>
                      ) : !activeTest && activeSuiteId ? (
                        <div className="flex items-center justify-center h-full text-neutral-mid text-sm p-8 text-center">
                          {t('recorder.recorderPage.noTestSteps')}
                        </div>
                      ) : (
                        <>
                          <div className="flex justify-between items-center p-1 border-b border-neutral-bdr">
                            <button
                              onClick={() => setShowCode(!showCode)}
                              className="text-xs px-2.5 py-1 rounded border border-neutral-bdr text-neutral-dk bg-white hover:bg-neutral-50 transition-colors font-medium"
                            >
                              {showCode
                                ? t('recorder.recorderPage.friendlyView')
                                : t('recorder.recorderPage.codeView')}
                            </button>
                            <button
                              onClick={() => setIsOutputVisible(!isOutputVisible)}
                              className="text-xs px-2.5 py-1 rounded border border-neutral-bdr text-neutral-dk bg-white hover:bg-neutral-50 transition-colors font-medium"
                            >
                              {isOutputVisible
                                ? t('recorder.recorderPage.hideOutput')
                                : t('recorder.recorderPage.testOutput')}
                            </button>
                          </div>
                          <CommandList
                            steps={activeTest?.steps ?? []}
                            setSteps={(newSteps: SetStateAction<string[]>) =>
                              updateActiveTest((prevTest) => {
                                if (!prevTest) return null
                                const updatedSteps =
                                  typeof newSteps === 'function' ? newSteps(prevTest.steps) : newSteps
                                return { ...prevTest, steps: updatedSteps }
                              })
                            }
                            onDeleteStep={(indexToDelete) =>
                              updateActiveTest((p) =>
                                p
                                  ? { ...p, steps: p.steps.filter((_, i) => i !== indexToDelete) }
                                  : null
                              )
                            }
                            onEditStep={(editIndex, newCommand) =>
                              updateActiveTest((p) =>
                                p
                                  ? {
                                      ...p,
                                      steps: p.steps.map((s, i) => (i === editIndex ? newCommand : s))
                                    }
                                  : null
                              )
                            }
                            showCode={showCode}
                          />
                        </>
                      )}
                    </StyledPanel>
                  </div>
                </div>
              </div>
              <div
                className={`${isOutputVisible ? 'h-48' : 'h-0 overflow-hidden'} transition-all duration-300 mt-2`}
              >
                <div className="h-full">
                  <StyledPanel>
                    <div className="flex justify-between items-center p-1 border-b border-neutral-bdr">
                      <h3 className="text-lg font-semibold text-neutral-dark">
                        {t('recorder.recorderPage.runOutput')}
                      </h3>
                    </div>
                    <OutputPanel output={runOutput} />
                  </StyledPanel>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Dashboard tab */}
      {activeTab === 'dashboard' && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <RecordingDashboard runOutput={runOutput} />
        </div>
      )}

      {assertionInfo && (
        <AssertionTextModal
          initialText={assertionInfo.text}
          onSave={handleSaveAssertionText}
          onClose={() => setAssertionInfo(null)}
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
