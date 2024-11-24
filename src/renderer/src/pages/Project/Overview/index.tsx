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
        navigate('/editor', { state: { fileName: filePath.split('/').pop(), fileContent: result.data } })
      } else {
        console.error('Error reading file:', result.error)
      }
    } catch (error) {
      console.error('Unexpected error reading file:', error)
    }
  }

  const handleRunTests = (): void => {
    console.log('Run Tests button clicked')
    // Add logic to initiate test execution
  }

  return (
    <div className="flex flex-col w-screen p-8">
      <div className="flex items-center justify-between mb-4 bg-gray-200 p-2 rounded-md">
        <div className="flex space-x-2">
          <Button onClick={handleRunTests} type="secondary">
            Run Tests
          </Button>
          <Button onClick={() => console.log('Open Allure Dashboard clicked')} type="primary">
            Allure Dashboard
          </Button>
        </div>
      </div>

      <div className="h-[70vh] border rounded-lg shadow-sm overflow-y-auto bg-white">
        <Folder
          name={projectPath.split('/').pop()}
          files={files}
          defaultOpen
          onFileClick={handleFileClick}
        />
      </div>
    </div>
  )
}

export default Overview
