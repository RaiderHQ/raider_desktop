import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import Folder from '@components/Library/Folder'
import useProjectStore from '@foundation/Stores/projectStore'
import useRubyStore from '@foundation/Stores/rubyStore'
import { FileNode } from '@foundation/Types/fileNode'
import ConfirmationModal from '@components/ConfirmationModal'

const Overview: React.FC = () => {
  const { t } = useTranslation()
  const projectPath: string | null = useProjectStore((state) => state.projectPath)
  const files: FileNode[] = useProjectStore((state) => state.files)
  const { rubyCommand } = useRubyStore()
  const navigate = useNavigate()
  const [currentToastId, setCurrentToastId] = useState<string | null>(null)
  const [isPermissionModalOpen, setIsPermissionModalOpen] = useState(false)
  const [permissionErrorPath, setPermissionErrorPath] = useState('')

  useEffect(() => {
    if (!projectPath) {
      navigate('/start-project')
    }
  }, [projectPath, navigate])

  useEffect(() => {
    const handleStatusUpdate = (
      _event: Electron.IpcRendererEvent,
      { status }: { status: string }
    ): void => {
      if (currentToastId) {
        if (status === 'installing') {
          toast.loading(t('overview.installingDependencies'), { id: currentToastId })
        } else if (status === 'running') {
          toast.loading(t('overview.running'), { id: currentToastId })
        }
      }
    }

    window.api.onTestRunStatus(handleStatusUpdate)

    return (): void => {
      window.api.removeTestRunStatusListener(handleStatusUpdate)
    }
  }, [currentToastId, t])

  const handleRunRaiderTests = async (): Promise<void> => {
    const toastId = toast.loading(t('overview.starting'))
    setCurrentToastId(toastId)

    try {
      const result = await window.api.runRaiderTests(projectPath || '', rubyCommand || '')
      toast.dismiss(toastId)
      setCurrentToastId(null)

      if (!result.success) {
        throw new Error(result.error || 'Test execution failed')
      }

      toast.success(t('overview.runTestsSuccess'))
    } catch (error) {
      if (toastId) toast.dismiss(toastId)
      setCurrentToastId(null)
      const errorMessage = (error as Error).message
      if (errorMessage.includes('grant write permissions')) {
        setPermissionErrorPath(errorMessage.split('`')[1] || errorMessage.split('\n')[2])
        setIsPermissionModalOpen(true)
      } else {
        toast.error(`${t('overview.error.runTests')}: ${errorMessage}`)
      }
    }
  }

  const handleGrantPermission = (): void => {
    window.api.openFinder(permissionErrorPath)
    setIsPermissionModalOpen(false)
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
            onRunTests={handleRunRaiderTests}
          />
        </div>
      </div>
      {isPermissionModalOpen && (
        <ConfirmationModal
          message={t('overview.error.permission.message', { path: permissionErrorPath })}
          onConfirm={handleGrantPermission}
          onCancel={() => setIsPermissionModalOpen(false)}
        />
      )}
    </div>
  )
}

export default Overview
