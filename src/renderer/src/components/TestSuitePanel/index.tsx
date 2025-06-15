import React, { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import ContentArea from '@components/ContentArea'

// Define the shape of our data
interface Test {
  id: string;
  name: string;
}
interface Suite {
  id: string;
  name: string;
  tests: Test[];
}

interface TestSuitePanelProps {
  suites: Suite[];
  activeSuiteId: string | null;
  activeTestId: string | null;
  onSuiteChange: (suiteId: string) => void;
  onTestSelect: (testId: string) => void;
  onCreateSuite: (suiteName: string) => void;
  onDeleteSuite: (suiteId: string) => void;
  onRunAllTests: (suiteId: string) => void;
  onReorderTests: (suiteId: string, tests: Test[]) => void;
}

const TestSuitePanel: React.FC<TestSuitePanelProps> = ({
                                                         suites,
                                                         activeSuiteId,
                                                         activeTestId,
                                                         onSuiteChange,
                                                         onTestSelect,
                                                         onCreateSuite,
                                                         onDeleteSuite,
                                                         onRunAllTests,
                                                         onReorderTests
                                                       }) => {
  const { t } = useTranslation()
  const activeSuite = suites.find((s) => s.id === activeSuiteId)

  // --- State for this component ---
  const [newSuiteName, setNewSuiteName] = useState('')
  // `isSuiteDropdownOpen` is the boolean state variable
  const [isSuiteDropdownOpen, setIsSuiteDropdownOpen] = useState(false)
  const [isCreatingSuite, setIsCreatingSuite] = useState(false)

  const dropdownRef = useRef<HTMLDivElement>(null)
  const dragItemIndex = useRef<number | null>(null)

  // Effect to close dropdown when clicking outside of it
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsSuiteDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownRef]);

  // --- Handlers ---
  const handleCreateSuiteConfirm = () => {
    if (newSuiteName.trim()) {
      onCreateSuite(newSuiteName.trim())
      setNewSuiteName('')
      setIsCreatingSuite(false)
    }
  }

  const handleDeleteSuite = () => {
    if (activeSuiteId && activeSuite) {
      if (window.confirm(`Are you sure you want to delete the suite "${activeSuite.name}"? This cannot be undone.`)) {
        onDeleteSuite(activeSuiteId)
      }
    }
    setIsSuiteDropdownOpen(false);
  }

  const handleNewSuiteClick = () => {
    setIsCreatingSuite(true);
    setIsSuiteDropdownOpen(false);
  }

  const handleRunAllClick = () => {
    if (activeSuiteId) {
      onRunAllTests(activeSuiteId);
    }
  }

  const handleDragStart = (index: number) => { dragItemIndex.current = index; };
  const handleDragEnter = (index: number) => { /* ... */ };
  const handleDragEnd = () => { dragItemIndex.current = null; };

  return (
    <div className="w-full h-full p-2">
      <ContentArea>
        <div className="h-full flex flex-col">
          <h2 className="text-xl font-semibold p-2 border-b border-gray-300 text-center flex-shrink-0">
            Test Suites
          </h2>

          <div className="flex-grow overflow-y-auto flex flex-col">
            <div className="flex items-center justify-between p-3 bg-gray-200 sticky top-0 z-20 border-b">
              {/* Custom Dropdown Container */}
              <div className="relative flex-grow" ref={dropdownRef}>
                <button
                  // This onClick correctly calls the SETTER function `setIsSuiteDropdownOpen`
                  onClick={() => setIsSuiteDropdownOpen(prev => !prev)}
                  className="w-full flex items-center justify-between p-2 border rounded bg-white hover:bg-gray-50 text-left"
                  aria-label="Select Test Suite"
                >
                  <span className="font-semibold truncate">{activeSuite?.name ?? 'Select a Suite'}</span>
                  {/* This correctly READS the boolean variable `isSuiteDropdownOpen` */}
                  <span className="text-xs ml-2">{isSuiteDropdownOpen ? '▲' : '▼'}</span>
                </button>
                {/* This also correctly READS the boolean variable */}
                {isSuiteDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-md shadow-lg z-30 border">
                    <ul>
                      {suites.map(suite => (
                        <li key={suite.id}>
                          <button
                            onClick={() => { onSuiteChange(suite.id); setIsSuiteDropdownOpen(false); }}
                            className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-100"
                          >
                            {suite.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                    <div className="border-t border-gray-200">
                      <button onClick={handleNewSuiteClick} className="block w-full text-left px-4 py-2 text-sm text-blue-600 hover:bg-gray-100">
                        + New Suite...
                      </button>
                      <button onClick={handleDeleteSuite} disabled={!activeSuiteId} className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:text-gray-400">
                        - Delete Current Suite
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="pl-2">
                <button
                  onClick={handleRunAllClick}
                  disabled={!activeSuite || activeSuite.tests.length === 0}
                  className="p-2 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-gray-400"
                  title="Run All Tests in Suite"
                >
                  ▶️ Run All
                </button>
              </div>
            </div>

            {isCreatingSuite && (
              <div className="p-2 border-b border-gray-300 space-y-2 flex-shrink-0 bg-yellow-50">
                <input type="text" value={newSuiteName} onChange={(e) => setNewSuiteName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleCreateSuiteConfirm()} placeholder="New suite name..." className="w-full flex-grow p-2 border rounded" autoFocus />
                <div className="flex justify-end space-x-2">
                  <button onClick={() => setIsCreatingSuite(false)} className="px-3 py-1 text-sm rounded bg-gray-200 hover:bg-gray-300">Cancel</button>
                  <button onClick={handleCreateSuiteConfirm} className="px-3 py-1 text-sm rounded bg-blue-600 text-white hover:bg-blue-700">Create</button>
                </div>
              </div>
            )}

            <ul className="flex-grow">
              {activeSuite?.tests.map((test, index) => (
                <li key={test.id} draggable onDragStart={() => handleDragStart(index)} onDragEnter={() => handleDragEnter(index)} onDragEnd={handleDragEnd} onDragOver={(e) => e.preventDefault()} className="cursor-grab active:cursor-grabbing">
                  <button onClick={() => onTestSelect(test.id)} draggable={false} className={`w-full text-left p-3 border-b border-gray-200 text-sm ${test.id === activeTestId ? 'bg-blue-200 font-semibold' : 'hover:bg-gray-200'}`}>
                    {test.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </ContentArea>
    </div>
  )
}

export default TestSuitePanel
