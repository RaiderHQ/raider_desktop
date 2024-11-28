import React, { useState } from 'react'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import Button from '@components/Button'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import Folder from '@components/Library/Folder'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import useProjectStore from '@foundation/Stores/projectStore'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { FileNode } from '@foundation/Types/fileNode'
import { useNavigate } from 'react-router-dom'

const Overview: React.FC = () => {
  const projectPath: string = useProjectStore((state: { projectPath: string }) => state.projectPath)
  const files: FileNode[] = useProjectStore((state: { files: FileNode[] }) => state.files)
  const navigate = useNavigate()
  const [isRunningTests, setIsRunningTests] = useState(false) // State to track test execution

  const handleFileClick = async (filePath: string): Promise<void> => {
    try {
      const result = await window.api.readFile(filePath)
      if (result.success) {
        navigate('/project/editor', {
          state: { fileName: filePath.split('/').pop(), filePath, fileContent: result.data }
        })
      } else {
        console.error('Error reading file:', result.error)
        alert('Error reading the file. Please try again.')
      }
    } catch (error) {
      console.error('Unexpected error reading file:', error)
      alert('Unexpected error occurred. Please try again.')
    }
  }

  const handleRunTests = async (): Promise<void> => {
    setIsRunningTests(true) // Start loader
    try {
      const result = await window.api.runTests(projectPath)
      setIsRunningTests(false) // Stop loader
      if (result.success) {
        console.log('Tests executed successfully:', result.output)
        // No alert on success as requested
      } else {
        console.error('Failed to execute tests:', result.error)
        alert('Error executing tests. Please try again.')
      }
    } catch (error) {
      setIsRunningTests(false) // Stop loader
      console.error('Unexpected error executing tests:', error)
      alert('Unexpected error occurred. Please try again.')
    }
  }

  const handleOpenAllure = async (): Promise<void> => {
    try {
      const result = await window.api.openAllure(projectPath)
      if (result.success) {
        console.log('Allure Dashboard opened:', result.output)
      } else {
        console.error('Failed to open Allure Dashboard:', result.error)
        alert('Error opening Allure Dashboard. Please try again.')
      }
    } catch (error) {
      console.error('Unexpected error opening Allure Dashboard:', error)
      alert('Unexpected error occurred. Please try again.')
    }
  }

  return (
    <div className="flex flex-col w-screen p-8">
      <div className="flex items-center justify-between mb-4 bg-gray-200 p-2 rounded-md">
        <div className="flex space-x-2">
          <Button onClick={handleRunTests} type="secondary" disabled={isRunningTests}>
            {isRunningTests ? 'Running...' : 'Run Tests'}
          </Button>
          <Button onClick={handleOpenAllure} type="primary">
            Allure Dashboard
          </Button>
        </div>
      </div>

      <div className="h-[70vh] border rounded-lg shadow-sm overflow-y-auto bg-white">
        <Folder
          name={projectPath.split('/').pop()}
          files={files}
          defaultOpen
          onFileClick={handleFileClick} // Pass the handleFileClick callback
        />
      </div>
    </div>
  )
}

export default Overview
