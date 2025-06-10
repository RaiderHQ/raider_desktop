import React from 'react';

interface Test {
  name: string;
  url: string;
  steps: string[];
}

interface TestSuiteProps {
  suite: Test[];
  activeTestName: string;
  onTestSelect: (testName: string) => void;
}

const TestSuite: React.FC<TestSuiteProps> = ({ suite, activeTestName, onTestSelect }) => {
  return (
    <div className="h-full bg-gray-100 border-r border-gray-300">
      <h3 className="text-lg font-semibold p-4 border-b border-gray-300">Test Suite</h3>
      <ul>
        {suite.map((test) => (
          <li key={test.name}>
            <button
              onClick={() => onTestSelect(test.name)}
              className={`w-full text-left p-4 border-b border-gray-200 ${
                test.name === activeTestName ? 'bg-blue-100 font-bold' : 'hover:bg-gray-200'
              }`}
            >
              {test.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default TestSuite;
