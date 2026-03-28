import React, { useState, useRef, useEffect } from 'react'
import type { Suite } from '@foundation/Types/suite'
import type { Test } from '@foundation/Types/test'
import { useTranslation } from 'react-i18next'
import useRecorderStore from '@foundation/Stores/recorderStore'

interface TestSuitePanelProps {
  suites: Suite[]
  activeSuiteId: string | null
  activeTestId: string | null
  onSuiteChange: (suiteId: string) => void
  onTestSelect: (testId: string) => void
  onCreateSuite: (suiteName: string) => void
  onDeleteSuite: (suiteId: string) => void
  onTestDeleteRequest: (test: Test) => void
  onRunAllTests: (suiteId: string) => void
  onReorderTests: (suiteId: string, tests: Test[]) => void
}

const TestSuitePanel: React.FC<TestSuitePanelProps> = ({
  suites,
  activeSuiteId,
  activeTestId,
  onSuiteChange,
  onTestSelect,
  onCreateSuite,
  onDeleteSuite,
  onTestDeleteRequest,
  onRunAllTests,
  onReorderTests
}) => {
  const { t } = useTranslation()
  const isRunning = useRecorderStore((s) => s.isRunning)
  const activeSuite = suites.find((s) => s.id === activeSuiteId)

  const [newSuiteName, setNewSuiteName] = useState('')
  const [isSuiteDropdownOpen, setIsSuiteDropdownOpen] = useState(false)
  const [isCreatingSuite, setIsCreatingSuite] = useState(false)
  const [displayedTests, setDisplayedTests] = useState<Test[]>([])

  const dropdownRef = useRef<HTMLDivElement>(null)
  const dragItemIndex = useRef<number | null>(null)

  useEffect(() => {
    setDisplayedTests(activeSuite?.tests ?? [])
  }, [activeSuite?.tests])

  useEffect((): (() => void) => {
    const handleClickOutside = (event: MouseEvent): void => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsSuiteDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return (): void => document.removeEventListener('mousedown', handleClickOutside)
  }, [dropdownRef])

  const handleCreateSuiteConfirm = (): void => {
    if (newSuiteName.trim()) {
      onCreateSuite(newSuiteName.trim())
      setNewSuiteName('')
      setIsCreatingSuite(false)
    }
  }

  const handleDeleteSuite = (): void => {
    if (activeSuiteId && activeSuite) {
      if (
        window.confirm(
          t('recorder.testSuitePanel.deleteConfirmation', { suiteName: activeSuite.name })
        )
      ) {
        onDeleteSuite(activeSuiteId)
      }
    }
    setIsSuiteDropdownOpen(false)
  }

  const handleNewSuiteClick = (): void => {
    setIsCreatingSuite(true)
    setIsSuiteDropdownOpen(false)
  }

  const handleRunAllClick = (): void => {
    if (activeSuite && activeSuite.id) {
      onRunAllTests(activeSuite.id)
    }
  }

  const handleDragStart = (index: number): void => {
    dragItemIndex.current = index
  }

  const handleDragEnter = (index: number): void => {
    if (dragItemIndex.current === null || dragItemIndex.current === index) {
      return
    }
    const newTests = [...displayedTests]
    const [draggedItem] = newTests.splice(dragItemIndex.current, 1)
    newTests.splice(index, 0, draggedItem)
    dragItemIndex.current = index
    setDisplayedTests(newTests)
  }

  const handleDragEnd = (): void => {
    if (activeSuiteId && displayedTests) {
      onReorderTests(activeSuiteId, displayedTests)
    }
    dragItemIndex.current = null
  }

  if (suites.length === 0) {
    return (
      <div className="w-full h-full p-2 flex flex-col items-center justify-center text-center">
        {isCreatingSuite ? (
          <div className="w-full max-w-xs space-y-3">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="48"
              height="48"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="1.5"
              className="mx-auto text-neutral-mid"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10.5v6m3-3H9m4.06-7.19l-2.12-2.12a1.5 1.5 0 00-1.06-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V8.25a2.25 2.25 0 00-2.25-2.25h-5.38a1.5 1.5 0 01-1.06-.44z" />
            </svg>
            <h3 className="text-lg font-semibold text-neutral-dk">
              {t('recorder.testSuitePanel.emptyTitle')}
            </h3>
            <input
              type="text"
              value={newSuiteName}
              onChange={(e) => setNewSuiteName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateSuiteConfirm()}
              placeholder={t('recorder.testSuitePanel.newSuiteName')}
              className="w-full p-2 border rounded"
              autoFocus
            />
            <div className="flex justify-center space-x-2">
              <button
                onClick={() => setIsCreatingSuite(false)}
                className="px-5 py-2 text-sm rounded bg-neutral-bdr hover:bg-neutral-bdr"
              >
                {t('recorder.testSuitePanel.cancel')}
              </button>
              <button
                onClick={handleCreateSuiteConfirm}
                className="px-5 py-2 text-sm rounded bg-ruby text-white"
              >
                {t('recorder.testSuitePanel.create')}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="48"
              height="48"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="1.5"
              className="mx-auto text-neutral-mid"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10.5v6m3-3H9m4.06-7.19l-2.12-2.12a1.5 1.5 0 00-1.06-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V8.25a2.25 2.25 0 00-2.25-2.25h-5.38a1.5 1.5 0 01-1.06-.44z" />
            </svg>
            <h3 className="text-lg font-semibold text-neutral-dk">
              {t('recorder.testSuitePanel.emptyTitle')}
            </h3>
            <p className="text-sm text-neutral-mid">
              {t('recorder.testSuitePanel.emptyDescription')}
            </p>
            <button
              onClick={() => setIsCreatingSuite(true)}
              className="px-6 py-2 text-sm rounded bg-ruby text-white font-medium"
            >
              {t('recorder.testSuitePanel.createFirst')}
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="w-full h-full p-2 flex flex-col">
      <div className="flex-shrink-0">
        <div className="flex items-center pb-2 border-b">
          <div className="relative w-full" ref={dropdownRef}>
            <button
              onClick={() => setIsSuiteDropdownOpen((prev) => !prev)}
              className="w-full flex items-center justify-between px-3 py-2 border rounded bg-white hover:bg-neutral-lt text-left"
              aria-label={t('recorder.testSuitePanel.selectSuite')}
            >
              <span className="font-semibold truncate">
                {activeSuite?.name ?? t('recorder.testSuitePanel.selectSuite')}
              </span>
              <span className="text-xs ml-2">{isSuiteDropdownOpen ? '▲' : '▼'}</span>
            </button>
            {isSuiteDropdownOpen && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-md shadow-lg z-30 border">
                <ul>
                  {suites.map((suite) => (
                    <li key={suite.id}>
                      <button
                        onClick={() => {
                          onSuiteChange(suite.id)
                          setIsSuiteDropdownOpen(false)
                        }}
                        className="block w-full text-left px-4 py-2 text-sm text-neutral-dk hover:bg-ruby-sub"
                      >
                        {suite.name}
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="border-t border-neutral-bdr">
                  <button
                    onClick={handleNewSuiteClick}
                    className="block w-full text-left px-4 py-2 text-sm text-ruby hover:bg-neutral-lt"
                  >
                    {t('recorder.testSuitePanel.newSuite')}
                  </button>
                  <button
                    onClick={handleDeleteSuite}
                    disabled={!activeSuiteId}
                    className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-status-err-bg disabled:text-neutral-mid"
                  >
                    {t('recorder.testSuitePanel.deleteSuite')}
                  </button>
                </div>
              </div>
            )}
          </div>
          <button
            onClick={handleRunAllClick}
            disabled={!activeSuite || activeSuite.tests.length === 0 || isRunning}
            title={t('recorder.testSuitePanel.runAll')}
            className={`ml-2 w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-full transition-colors ${
              !activeSuite || activeSuite.tests.length === 0 || isRunning
                ? 'text-neutral-300 cursor-not-allowed'
                : 'text-green-600 hover:bg-green-50'
            }`}
          >
            {isRunning ? (
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-spin">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round"/>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <polygon points="5,3 19,12 5,21" />
              </svg>
            )}
          </button>
        </div>

        {isCreatingSuite && (
          <div className="p-2 border-b border-neutral-bdr flex items-center space-x-2 bg-yellow-50">
            <input
              type="text"
              value={newSuiteName}
              onChange={(e) => setNewSuiteName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateSuiteConfirm()}
              placeholder={t('recorder.testSuitePanel.newSuiteName')}
              className="flex-grow p-2 border rounded"
              autoFocus
            />
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setIsCreatingSuite(false)}
                className="px-5 py-2 text-sm rounded bg-neutral-bdr hover:bg-neutral-bdr"
              >
                {t('recorder.testSuitePanel.cancel')}
              </button>
              <button
                onClick={handleCreateSuiteConfirm}
                className="px-5 py-2 text-sm rounded bg-ruby text-white"
              >
                {t('recorder.testSuitePanel.create')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Scrolling part */}
      <div className="flex-grow overflow-y-auto">
        <ul>
          {displayedTests.map((test, index) => (
            <li
              key={test.id}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragEnter={() => handleDragEnter(index)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => e.preventDefault()}
              className="group flex items-center justify-between cursor-grab active:cursor-grabbing border-b border-neutral-bdr"
            >
              <button
                onClick={() => onTestSelect(test.id)}
                draggable={false}
                className={`w-full text-left p-3 text-sm flex-grow transition-colors ${
                  test.id === activeTestId ? 'font-semibold' : 'hover:bg-neutral-lt'
                }`}
              >
                {test.name}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onTestDeleteRequest(test)
                }}
                className="mr-1 w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-full text-neutral-mid opacity-0 group-hover:opacity-100 hover:text-red-500 hover:bg-red-50 transition-all"
                aria-label={`Delete test ${test.name}`}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  fill="currentColor"
                  viewBox="0 0 16 16"
                >
                  <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export default TestSuitePanel
