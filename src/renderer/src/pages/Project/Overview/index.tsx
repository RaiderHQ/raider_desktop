import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
  const projectPath: string = useProjectStore((state: { projectPath: string }) => state.projectPath)
  const files: FileNode[] = useProjectStore((state: { files: FileNode[] }) => state.files)
  const navigate = useNavigate()
  const [isRunningTests, setIsRunningTests] = useState(false)

  const handleFileClick = async (filePath: string): Promise<void> => {
    try {
      const result = await window.api.readFile(filePath)
      if (result.success) {
        navigate('/project/editor', {
          state: { fileName: filePath.split('/').pop(), filePath, fileContent: result.data }
        })
      } else {
        console.error(t('overview.error.readFile'), result.error)
        alert(t('overview.error.readFile'))
      }
    } catch (error) {
      console.error(t('overview.error.unexpectedReadFile'), error)
      alert(t('overview.error.unexpectedReadFile'))
    }
  }

  const handleRunTests = async (): Promise<void> => {
    setIsRunningTests(true)
    try {
      const result = await window.api.runTests(projectPath)
      setIsRunningTests(false)
      if (result.success) {
        console.log('Tests executed successfully:', result.output)
      } else {
        console.error(t('overview.error.runTests'), result.error)
        alert(t('overview.error.runTests'))
      }
    } catch (error) {
      setIsRunningTests(false)
      console.error(t('overview.error.unexpectedRunTests'), error)
      alert(t('overview.error.unexpectedRunTests'))
    }
  }

  const handleOpenAllure = async (): Promise<void> => {
    try {
      const result = await window.api.openAllure(projectPath)
      if (result.success) {
        console.log('Allure Dashboard opened:', result.output)
      } else {
        console.error(t('overview.error.openAllure'), result.error)
        alert(t('overview.error.openAllure'))
      }
    } catch (error) {
      console.error(t('overview.error.unexpectedOpenAllure'), error)
      alert(t('overview.error.unexpectedOpenAllure'))
    }
  }

  return (
    <div className="flex flex-col w-screen p-8">
      <div className="flex items-center justify-between mb-4 bg-gray-200 p-2 rounded-md">
        <div className="flex space-x-2">
          <Button onClick={handleRunTests} type="secondary" disabled={isRunningTests}>
            {isRunningTests ? t('overview.running') : t('overview.runTests')}
          </Button>
          <Button onClick={handleOpenAllure} type="primary">
            {t('overview.allureDashboard')}
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
