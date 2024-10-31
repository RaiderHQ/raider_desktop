import React, { useState } from 'react'
import { FaFolder, FaFileAlt, FaChevronDown, FaChevronRight, FaPlay, FaStop } from 'react-icons/fa'

const Overview: React.FC = () => {
  const [isIntegrationExpanded, setIntegrationExpanded] = useState(true)
  const [isExamplesExpanded, setExamplesExpanded] = useState(true)
  const [allSelected, setAllSelected] = useState(false) // State for Select All checkbox
  const [fileSelections, setFileSelections] = useState<boolean[]>([false, false, false, false]) // Track individual file selections

  const handleIntegrationToggle = () => {
    setIntegrationExpanded(!isIntegrationExpanded)
  }

  const handleExamplesToggle = () => {
    setExamplesExpanded(!isExamplesExpanded)
  }

  // Mock file structure
  const files = ['actions_spec.rb', 'aliasing_spec.rb', 'pdp_spec.rb', 'connections_spec.rb']

  // Handlers for play, stop, and file select
  const handlePlay = () => {
    console.log('Play button clicked')
    // Add play logic here
  }

  const handleStop = () => {
    console.log('Stop button clicked')
    // Add stop logic here
  }

  const handleSelectAll = () => {
    const newSelectAll = !allSelected
    setAllSelected(newSelectAll)
    setFileSelections(Array(files.length).fill(newSelectAll)) // Set all files to selected or unselected
  }

  const handleFileCheckboxChange = (index: number) => {
    const newSelections = [...fileSelections]
    newSelections[index] = !newSelections[index]
    setFileSelections(newSelections)

    // Update the Select All checkbox if all files are selected/unselected
    setAllSelected(newSelections.every(selected => selected))
  }

  return (
    <div className="flex flex-col w-screen p-8">
      {/* Control area with icons, checkbox, and dashboard button */}
      <div className="flex items-center justify-between mb-4 bg-gray-200 p-2 rounded-md">
        {/* Icons and checkbox group */}
        <div className="flex items-center space-x-2">
          {/* Select All Checkbox */}
          <input
            type="checkbox"
            checked={allSelected}
            onChange={handleSelectAll}
            className="w-5 h-5 cursor-pointer appearance-none bg-transparent checked:bg-red-300 border-b-[1px]"
          />

          {/* Play and Stop icons */}
          <FaPlay
            onClick={handlePlay}
            className="text-green-500 text-xl cursor-pointer"
            title="Play"
          />
          <FaStop
            onClick={handleStop}
            className="text-red-500 text-xl cursor-pointer"
            title="Stop"
          />
        </div>

        {/* Open Allure Dashboard Button */}
        <button
          onClick={() => console.log('Open Allure Dashboard clicked')}
          className="bg-gray-50 text-black px-4 py-2 hover:bg-red-200 text-sm"
        >
          Open Allure Dashboard
        </button>
      </div>

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
                    <input
                      type="checkbox"
                      className="mr-2"
                      checked={fileSelections[index]}
                      onChange={() => handleFileCheckboxChange(index)}
                    />
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
