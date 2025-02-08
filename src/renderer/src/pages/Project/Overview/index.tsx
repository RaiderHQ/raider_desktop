import React from 'react'
import { useTranslation } from 'react-i18next'
import Folder from '@components/Library/Folder'
import useProjectStore from '@foundation/Stores/projectStore'
import { FileNode } from '@foundation/Types/fileNode'
import { useNavigate } from 'react-router-dom'

const Overview: React.FC = () => {
  const { t } = useTranslation()
  const projectPath: string = useProjectStore((state: { projectPath: string }) => state.projectPath)
  const files: FileNode[] = useProjectStore((state: { files: FileNode[] }) => state.files)
  const navigate = useNavigate()

  const handleRunTests = async (): Promise<void> => {
    try {
      const result = await window.api.runTests(projectPath)
      if (!result.success) {
        throw new Error(result.error || 'Test execution failed')
      }
    } catch (error) {
      alert(`${t('overview.error.runTests')}: ${error}`)
    }
  }


  return (
    <div className="flex flex-col w-screen p-8">
      <div className="relative w-full">
        <div className="absolute -right-1 -bottom-1 w-full h-full bg-[#c14420] rounded-lg" />
        <div className="relative h-[70vh] border rounded-lg shadow-sm overflow-y-auto bg-white z-10">
          <Folder
            name={projectPath.split('/').pop()}
            files={files}
            defaultOpen={true}
            onFileClick={(filePath: string): void => {
              navigate('/project/editor', {
                state: { fileName: filePath.split('/').pop(), filePath }
              })
            }}
            isRoot={true}
            onRunTests={handleRunTests}
          />
        </div>
      </div>
    </div>
  )
}

export default Overview
