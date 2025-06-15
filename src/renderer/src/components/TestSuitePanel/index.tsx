import React, { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'

// Define the shape of our data with unique IDs
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
  const [newSuiteName, setNewSuiteName] = useState('')

  // Ref for managing drag-and-drop state
  const dragItemIndex = useRef<number | null>(null)

  const handleCreateClick = () => {
    if (newSuiteName.trim()) {
      onCreateSuite(newSuiteName.trim())
      setNewSuiteName('')
    }
  }

  const handleDeleteClick = () => {
    if (activeSuiteId && activeSuite) {
      if (window.confirm(`Are you sure you want to delete the suite "${activeSuite.name}"? This cannot be undone.`)) {
        onDeleteSuite(activeSuiteId)
      }
    }
  }

  const handleRunAllClick = () => {
    if (activeSuiteId) {
      onRunAllTests(activeSuiteId);
    }
  }

  // --- Drag and Drop Handlers for Tests ---

  const handleDragStart = (index: number) => {
    dragItemIndex.current = index;
  };

  const handleDragEnter = (index: number) => {
    if (dragItemIndex.current === null || dragItemIndex.current === index || !activeSuite) return;

    const reorderedTests = [...activeSuite.tests];
    const [draggedItem] = reorderedTests.splice(dragItemIndex.current, 1);
    reorderedTests.splice(index, 0, draggedItem);

    dragItemIndex.current = index;
    // Notify the parent component of the new test order
    onReorderTests(activeSuite.id, reorderedTests);
  };

  const handleDragEnd = () => {
    dragItemIndex.current = null;
  };

  return (
    <div className="h-full bg-gray-100 border-r border-gray-300 flex flex-col">
      {/* Suite Selection Header */}
      <div className="p-2 border-b border-gray-300 flex items-center space-x-2">
        <select
          value={activeSuiteId ?? ''}
          onChange={(e) => onSuiteChange(e.target.value)}
          className="flex-grow p-2 border rounded"
          aria-label="Select Test Suite"
        >
          <option value="" disabled>-- Select a Suite --</option>
          {suites.map((suite) => (
            <option key={suite.id} value={suite.id}>
              {suite.name}
            </option>
          ))}
        </select>
        <button
          onClick={handleDeleteClick}
          disabled={!activeSuiteId}
          className="flex-shrink-0 p-2 w-10 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-400"
          aria-label="Delete Selected Suite"
        >
          🗑️
        </button>
      </div>

      {/* Create Suite Input and Button */}
      <div className="p-2 border-b border-gray-300 flex items-center space-x-2">
        <input
          type="text"
          value={newSuiteName}
          onChange={(e) => setNewSuiteName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreateClick()}
          placeholder="New suite name..."
          className="flex-grow p-2 border rounded"
        />
        <button
          onClick={handleCreateClick}
          className="flex-shrink-0 p-2 w-10 bg-blue-600 text-white rounded hover:bg-blue-700 font-bold"
          aria-label="Create New Suite"
        >
          +
        </button>
      </div>

      {/* Test List for the Active Suite */}
      <div className="flex-grow overflow-y-auto">
        <div className="flex items-center justify-between bg-gray-200 sticky top-0">
          <h3 className="text-md font-semibold p-3">Tests</h3>
          <button
            onClick={handleRunAllClick}
            disabled={!activeSuite || activeSuite.tests.length === 0}
            className="mr-2 flex items-center p-1 px-2 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-gray-400"
          >
            <span className="mr-1">▶️</span>
            Run All
          </button>
        </div>
        <ul>
          {activeSuite?.tests.map((test, index) => (
            <li
              key={test.id}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragEnter={() => handleDragEnter(index)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => e.preventDefault()}
              className="cursor-grab active:cursor-grabbing"
            >
              <button
                onClick={() => onTestSelect(test.id)}
                draggable={false}
                className={`w-full text-left p-3 border-b border-gray-200 text-sm ${
                  test.id === activeTestId
                    ? 'bg-blue-200 font-semibold'
                    : 'hover:bg-gray-200'
                }`}
              >
                {test.name}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export default TestSuitePanel
