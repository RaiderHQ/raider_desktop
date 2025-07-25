import React from 'react'
import Button from '@components/Button'
import InputField from '@components/InputField'
import Dropdown from '@components/Dropdown'
import type { Test } from '@foundation/Types/test'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

interface MainRecorderPanelProps {
  activeSuiteName: string | undefined
  activeTest: Test | null
  isRecording: boolean
  isRunning: boolean
  onTestNameChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onUrlChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onStartRecording: () => void
  onRunTest: () => void
  onStopRecording: () => void
  onNewTest: () => void
  onExportTest: () => Promise<{ success: boolean; path?: string; error?: string }>
  onExportSuite: () => Promise<{ success: boolean; path?: string; error?: string }>
  onExportProject: () => Promise<{ success: boolean; path?: string; error?: string }>
  onImportTest: () => Promise<{ success: boolean; test?: Test; error?: string }>
  onImportSuite: () => Promise<{ success: boolean; suite?: Suite; error?: string }>
  onImportProject: () => Promise<{ success: boolean; error?: string }>
  activeSuiteId: string | null
}

const MainRecorderPanel: React.FC<MainRecorderPanelProps> = ({
  activeSuiteName,
  activeTest,
  isRecording,
  isRunning,
  onTestNameChange,
  onUrlChange,
  onStartRecording,
  onRunTest,
  onStopRecording,
  onNewTest,
  onExportTest,
  onExportSuite,
  onExportProject,
  onImportTest,
  onImportSuite,
  onImportProject,
  activeSuiteId,
}) => {
  const { t } = useTranslation()

  const handleExportClick = async (exportType: 'Test' | 'Suite' | 'Project'): Promise<void> => {
    let result
    switch (exportType) {
      case 'Test':
        result = await onExportTest()
        break
      case 'Suite':
        result = await onExportSuite()
        break
      case 'Project':
        result = await onExportProject()
        break
      default:
        return
    }

    if (result.success) {
      toast.success(t('recorder.mainRecorderPanel.exportSuccess', { exportType, path: result.path }))
    } else {
      toast.error(t('recorder.mainRecorderPanel.exportError', { error: result.error }))
    }
  }

  const handleImportClick = async (importType: 'Test' | 'Suite' | 'Project'): Promise<void> => {
    let result
    switch (importType) {
      case 'Test':
        result = await onImportTest()
        break
      case 'Suite':
        result = await onImportSuite()
        break
      case 'Project':
        result = await onImportProject()
        break
      default:
        return
    }

    if (result.success) {
      toast.success(t('recorder.mainRecorderPanel.importSuccess', { importType }))
    } else {
      toast.error(t('recorder.mainRecorderPanel.importError', { error: result.error }))
    }
  }

  const exportOptions = [
    { label: t('recorder.mainRecorderPanel.exportTest'), onClick: () => handleExportClick('Test') },
    {
      label: t('recorder.mainRecorderPanel.exportSuite'),
      onClick: () => handleExportClick('Suite'),
    },
    {
      label: t('recorder.mainRecorderPanel.exportProject'),
      onClick: () => handleExportClick('Project'),
    },
  ]

  const importOptions = [
    { label: t('recorder.mainRecorderPanel.importTest'), onClick: () => handleImportClick('Test') },
    {
      label: t('recorder.mainRecorderPanel.importSuite'),
      onClick: () => handleImportClick('Suite'),
    },
    {
      label: t('recorder.mainRecorderPanel.importProject'),
      onClick: () => handleImportClick('Project'),
    },
  ]

  return (
    <div className="flex-none pb-1 pr-1">
      <div className="relative">
        <div className="relative flex flex-col border border-black rounded-lg bg-white p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">
              {activeSuiteName
                ? t('recorder.mainRecorderPanel.suite', { activeSuiteName })
                : t('recorder.mainRecorderPanel.noSuite')}
            </h2>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex-1">
              <InputField
                value={activeTest?.name ?? ''}
                onChange={onTestNameChange}
                placeholder={t('recorder.mainRecorderPanel.testName')}
                disabled={!activeTest}
              />
            </div>
            <div className="flex-1">
              <InputField
                value={activeTest?.url ?? ''}
                onChange={onUrlChange}
                placeholder={t('recorder.mainRecorderPanel.url')}
                disabled={!activeTest}
              />
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-gray-200 pt-4">
            <div className="flex items-center space-x-2">
              <Button
                onClick={onNewTest}
                disabled={!activeSuiteId}
                type={!activeSuiteId ? 'disabled' : 'secondary'}
              >
                {t('recorder.mainRecorderPanel.newTest')}
              </Button>
              <Dropdown
                buttonText={t('recorder.mainRecorderPanel.import')}
                options={importOptions}
                defaultOption={2}
              />
              <Dropdown
                buttonText={t('recorder.mainRecorderPanel.export')}
                options={exportOptions}
                defaultOption={2}
                disabled={!activeTest || isRecording}
              />
            </div>
            <div className="flex items-center space-x-2">
              <Button
                onClick={onStartRecording}
                disabled={!activeTest || isRecording}
                type={isRecording ? 'disabled' : 'primary'}
              >
                {t('recorder.mainRecorderPanel.record')}
              </Button>
              <Button
                onClick={onRunTest}
                disabled={!activeTest || isRecording || isRunning}
                type={!activeTest || isRecording || isRunning ? 'disabled' : 'success'}
              >
                {t('recorder.mainRecorderPanel.run')}
              </Button>
              <Button
                onClick={onStopRecording}
                disabled={!isRecording}
                type={!isRecording ? 'disabled' : 'secondary'}
              >
                {t('recorder.mainRecorderPanel.stop')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default MainRecorderPanel
