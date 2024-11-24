import React from 'react'
import Button from '@components/Button'
import Folder from '@components/Library/Folder'
import useProjectStore from '@foundation/Stores/projectStore'
import { FileNode } from '@foundation/Types/fileNode'
import { useNavigate } from 'react-router-dom'

const Overview: React.FC = () => {
  const projectPath: string = useProjectStore((state: { projectPath: string }) => state.projectPath)
  const files: FileNode[] = useProjectStore((state: { files: FileNode[] }) => state.files)
  const navigate = useNavigate()

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

  const handleRunTests = (): void => {
    console.log('Run Tests button clicked')
    // Add logic to initiate test execution
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
          <Button onClick={handleRunTests} type="secondary">
            Run Tests
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
