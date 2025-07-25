import React, { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import Folder from '@components/Library/Folder'
import useProjectStore from '@foundation/Stores/projectStore'
import { FileNode } from '@foundation/Types/fileNode'

const Overview: React.FC = () => {
  const { t } = useTranslation()
  const projectPath: string | null = useProjectStore((state) => state.projectPath)
  const files: FileNode[] = useProjectStore((state) => state.files)
  const navigate = useNavigate()

  useEffect(() => {
    if (!projectPath) {
      navigate('/start-project')
    }
  }, [projectPath, navigate])

  const handleRunTests = async (): Promise<void> => {
    const toastId = toast.loading(t('overview.running'))
    try {
      const suites = await window.api.getSuites()
      if (!suites || suites.length === 0) {
        throw new Error('No suites found to run.')
      }
      for (const suite of suites) {
        const result = await window.api.runSuite(suite.id, projectPath || '')
        if (!result.success) {
          throw new Error(result.output || 'Test execution failed')
        }
      }
      toast.dismiss(toastId)
      toast.success(t('overview.runTestsSuccess'))
    } catch (error) {
      toast.dismiss(toastId)
      toast.error(`${t('overview.error.runTests')}: ${error}`)
    }
  }

  return (
    <div className="flex flex-col w-screen p-8">
      <div className="relative w-full">
        <div className="absolute -right-1 -bottom-1 w-full h-full bg-[#c14420] rounded-lg" />
        <div className="relative h-[70vh] border rounded-lg shadow-sm overflow-y-auto bg-white z-10">
          <Folder
            name={projectPath ? projectPath.split('/').pop() : ''}
            files={files}
            defaultOpen={true}
            onFileClick={(filePath: string): void => {
              navigate('/file-editor', {
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
