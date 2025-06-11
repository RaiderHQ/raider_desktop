import React, { useState } from 'react'
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
  onDeleteSuite: (suiteId: string) => void; // New prop for deleting a suite
}

const TestSuitePanel: React.FC<TestSuitePanelProps> = ({
                                                         suites,
                                                         activeSuiteId,
                                                         activeTestId,
                                                         onSuiteChange,
                                                         onTestSelect,
                                                         onCreateSuite,
                                                         onDeleteSuite
                                                       }) => {
  const { t } = useTranslation()
  const activeSuite = suites.find((s) => s.id === activeSuiteId)
  const [newSuiteName, setNewSuiteName] = useState('')

  const handleCreateClick = () => {
    if (newSuiteName.trim()) {
      onCreateSuite(newSuiteName.trim())
      setNewSuiteName('')
    }
  }

  const handleDeleteClick = () => {
    if (activeSuiteId && activeSuite) {
      // Use a standard confirm dialog before performing a destructive action
      if (window.confirm(`Are you sure you want to delete the suite "${activeSuite.name}"? This cannot be undone.`)) {
        onDeleteSuite(activeSuiteId);
      }
    }
  }

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
        {/* Delete Suite Button */}
        <button
          onClick={handleDeleteClick}
          disabled={!activeSuiteId}
          className="p-2 w-10 bg-red-500 text-white rounded hover:bg-red-600 disabled:bg-gray-400"
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
          className="p-2 w-10 bg-blue-500 text-white rounded hover:bg-blue-600 font-bold"
          aria-label="Create New Suite"
        >
          +
        </button>
      </div>

      {/* Test List for the Active Suite */}
      <div className="flex-grow overflow-y-auto">
        <h3 className="text-md font-semibold p-3 bg-gray-200">Tests</h3>
        <ul>
          {activeSuite?.tests.map((test) => (
            <li key={test.id}>
              <button
                onClick={() => onTestSelect(test.id)}
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
