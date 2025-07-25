import React, { useState, useRef, useEffect } from 'react'
import Button from '@components/Button'
import type { Suite } from '@foundation/Types/suite'
import type { Test } from '@foundation/Types/test'

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

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsSuiteDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [dropdownRef])

  const handleCreateSuiteConfirm = () => {
    if (newSuiteName.trim()) {
      onCreateSuite(newSuiteName.trim())
      setNewSuiteName('')
      setIsCreatingSuite(false)
    }
  }

  const handleDeleteSuite = () => {
    if (activeSuiteId && activeSuite) {
      if (
        window.confirm(
          `Are you sure you want to delete the suite "${activeSuite.name}"? This cannot be undone.`
        )
      ) {
        onDeleteSuite(activeSuiteId)
      }
    }
    setIsSuiteDropdownOpen(false)
  }

  const handleNewSuiteClick = () => {
    setIsCreatingSuite(true)
    setIsSuiteDropdownOpen(false)
  }

  const handleRunAllClick = () => {
    if (activeSuite && activeSuite.id) {
      onRunAllTests(activeSuite.id)
    }
  }

  const handleDragStart = (index: number) => {
    dragItemIndex.current = index
  }

  const handleDragEnter = (index: number) => {
    if (dragItemIndex.current === null || dragItemIndex.current === index) {
      return
    }
    const newTests = [...displayedTests]
    const [draggedItem] = newTests.splice(dragItemIndex.current, 1)
    newTests.splice(index, 0, draggedItem)
    dragItemIndex.current = index
    setDisplayedTests(newTests)
  }

  const handleDragEnd = () => {
    if (activeSuiteId && displayedTests) {
      onReorderTests(activeSuiteId, displayedTests)
    }
    dragItemIndex.current = null
  }

  return (
    <div className="w-full h-full p-2 flex flex-col">
      <div className="flex-shrink-0">
        <div className="flex items-center pb-2 border-b">
          <div className="relative w-full" ref={dropdownRef}>
            <button
              onClick={() => setIsSuiteDropdownOpen((prev) => !prev)}
              className="w-full flex items-center justify-between px-3 py-2 border rounded bg-white hover:bg-gray-50 text-left"
              aria-label="Select Test Suite"
            >
              <span className="font-semibold truncate">
                {activeSuite?.name ?? 'Select a Suite'}
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
                        className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-100"
                      >
                        {suite.name}
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="border-t border-gray-200">
                  <button
                    onClick={handleNewSuiteClick}
                    className="block w-full text-left px-4 py-2 text-sm text-blue-600 hover:bg-gray-100"
                  >
                    + New Suite...
                  </button>
                  <button
                    onClick={handleDeleteSuite}
                    disabled={!activeSuiteId}
                    className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:text-gray-400"
                  >
                    - Delete Current Suite
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="pl-4">
            <Button
              type="success"
              onClick={handleRunAllClick}
              disabled={!activeSuite || activeSuite.tests.length === 0}
            >
              Run All
            </Button>
          </div>
        </div>

        {isCreatingSuite && (
          <div className="p-2 border-b border-gray-300 flex items-center space-x-2 bg-yellow-50">
            <input
              type="text"
              value={newSuiteName}
              onChange={(e) => setNewSuiteName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateSuiteConfirm()}
              placeholder="New suite name..."
              className="flex-grow p-2 border rounded"
              autoFocus
            />
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setIsCreatingSuite(false)}
                className="px-5 py-2 text-sm rounded bg-gray-200 hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateSuiteConfirm}
                className="px-5 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
              >
                Create
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
              className="group flex items-center justify-between cursor-grab active:cursor-grabbing border-b border-gray-200"
            >
              <button
                onClick={() => onTestSelect(test.id)}
                draggable={false}
                className={`w-full text-left p-3 text-sm flex-grow transition-colors ${test.id === activeTestId ? 'bg-blue-200 font-semibold' : 'hover:bg-gray-100'}`}
              >
                {test.name}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onTestDeleteRequest(test)
                }}
                className="p-3 text-gray-400 group-hover:opacity-100 hover:text-white hover:bg-red-600 transition-all"
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
