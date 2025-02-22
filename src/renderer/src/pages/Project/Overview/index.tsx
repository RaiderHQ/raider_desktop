import React from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useOutletContext } from 'react-router-dom'
import toast from 'react-hot-toast'
import Folder from '@components/Library/Folder'
import useProjectStore from '@foundation/Stores/projectStore'
import { FileNode } from '@foundation/Types/fileNode'
import Terminal from '@components/Terminal'

interface OutletContextType {
  showTerminal: boolean
  setShowTerminal: (value: boolean) => void
}

const Overview: React.FC = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { showTerminal } = useOutletContext<OutletContextType>()
  const projectPath: string = useProjectStore((state) => state.projectPath)
  const files: FileNode[] = useProjectStore((state) => state.files)

  const handleRunTests = async (): Promise<void> => {
    const toastId = toast.loading(t('overview.running'))
    try {
      const result = await window.api.runTests(projectPath)
      toast.dismiss(toastId)

      if (!result.success) {
        throw new Error(result.error || 'Test execution failed')
      }

      toast.success(t('overview.runTestsSuccess'))
    } catch (error) {
      toast.dismiss(toastId)
      toast.error(`${t('overview.error.runTests')}: ${error}`)
    }
  }

  return (
    <div className="flex flex-col w-screen p-8 space-y-4">
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
      {showTerminal && (
        <div className="mt-4">
          <Terminal />
        </div>
      )}
    </div>
  )
}

export default Overview
