import React, { useState } from 'react'
import { FaFolder, FaFileAlt, FaChevronDown, FaChevronRight } from 'react-icons/fa'

const Overview: React.FC = () => {
  const [isIntegrationExpanded, setIntegrationExpanded] = useState(true)
  const [isExamplesExpanded, setExamplesExpanded] = useState(true)

  const handleIntegrationToggle = () => {
    setIntegrationExpanded(!isIntegrationExpanded)
  }

  const handleExamplesToggle = () => {
    setExamplesExpanded(!isExamplesExpanded)
  }

  // Mock file structure
  const files = ['actions.spec.js', 'aliasing.spec.js', 'assertions.spec.js', 'connections.spec.js']

  return (
    <div className="flex flex-col w-screen p-8">
      {/* Folder Section - Occupies 80% of the screen height */}
      <div className="h-[70vh] border rounded-lg shadow-sm overflow-y-auto bg-white">
        {/* Integration Testing Folder */}
        <button
          className="flex items-center w-full px-4 py-2 bg-gray-100 border-b focus:outline-none"
          onClick={handleIntegrationToggle}
        >
          {isIntegrationExpanded ? <FaChevronDown /> : <FaChevronRight />}
          <FaFolder className="ml-2 mr-2" />
          <span className="font-semibold">Integration testing</span>
        </button>

        {isIntegrationExpanded && (
          <div className="pl-8">
            {/* Examples Folder */}
            <button
              className="flex items-center w-full px-4 py-2 bg-gray-50 border-b focus:outline-none"
              onClick={handleExamplesToggle}
            >
              {isExamplesExpanded ? <FaChevronDown /> : <FaChevronRight />}
              <FaFolder className="ml-2 mr-2" />
              <span className="font-semibold">examples</span>
            </button>

            {isExamplesExpanded && (
              <div className="pl-8">
                {/* Render list of files */}
                {files.map((file, index) => (
                  <div key={index} className="flex items-center px-4 py-2 border-b">
                    <FaFileAlt className="mr-2 text-gray-600" />
                    <span>{file}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default Overview
