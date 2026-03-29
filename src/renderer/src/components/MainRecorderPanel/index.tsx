import React from 'react'
import InputField from '@components/InputField'
import Dropdown from '@components/Dropdown'
import Tooltip from '@components/Tooltip'
import type { Suite } from '@foundation/Types/suite'
import type { Test } from '@foundation/Types/test'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import useRecorderStore from '@foundation/Stores/recorderStore'
import { createNewTest } from '@foundation/recorderUtils'

interface MainRecorderPanelProps {
  onStartRecording: () => void
  onRunTest: () => void
  onStopRecording: () => void
}

const MainRecorderPanel: React.FC<MainRecorderPanelProps> = ({
  onStartRecording,
  onRunTest,
  onStopRecording
}) => {
  const { t } = useTranslation()
  const activeTest = useRecorderStore((s) => s.activeTest)
  const isRecording = useRecorderStore((s) => s.isRecording)
  const isRunning = useRecorderStore((s) => s.isRunning)
  const activeSuiteId = useRecorderStore((s) => s.activeSuiteId)
  const activeSuiteName = useRecorderStore((s) => s.activeSuite()?.name)

  const { setActiveTest } = useRecorderStore.getState()

  const onTestNameChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    useRecorderStore.getState().updateActiveTest((p) =>
      p ? { ...p, name: e.target.value } : null
    )
  }

  const onUrlChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    useRecorderStore.getState().updateActiveTest((p) =>
      p ? { ...p, url: e.target.value } : null
    )
  }

  const onNewTest = (): void => {
    const suiteId = useRecorderStore.getState().activeSuiteId
    if (suiteId) {
      const newTest = createNewTest()
      setActiveTest(newTest)
      window.api.saveRecording(suiteId, newTest)
    }
  }

  const handleExportClick = async (exportType: 'Test' | 'Suite' | 'Project'): Promise<void> => {
    let result: { success: boolean; path?: string; error?: string }
    const { activeTest: test, activeSuiteId: suiteId } = useRecorderStore.getState()

    switch (exportType) {
      case 'Test':
        if (test?.steps && test.steps.length > 0) {
          result = await window.api.exportTest(test.name, test.steps)
        } else {
          result = { success: false, error: 'There are no steps to export.' }
        }
        break
      case 'Suite':
        if (suiteId) {
          result = await window.api.exportSuite(suiteId)
        } else {
          result = { success: false, error: 'There is no active suite to export.' }
        }
        break
      case 'Project':
        result = await window.api.exportProject()
        break
      default:
        return
    }

    if (result.success) {
      toast.success(
        t('recorder.mainRecorderPanel.exportSuccess', { exportType, path: result.path })
      )
    } else {
      toast.error(t('recorder.mainRecorderPanel.exportError', { error: result.error }))
    }
  }

  const handleImportClick = async (importType: 'Test' | 'Suite' | 'Project'): Promise<void> => {
    let result: { success: boolean; test?: Test; suite?: Suite; error?: string }
    const suiteId = useRecorderStore.getState().activeSuiteId

    switch (importType) {
      case 'Test':
        if (suiteId) {
          result = await window.api.importTest(suiteId)
        } else {
          result = { success: false, error: 'There is no active suite to import the test into.' }
        }
        break
      case 'Suite':
        result = await window.api.importSuite()
        break
      case 'Project':
        result = await window.api.importProject()
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

  const moreOptions = [
    {
      label: t('recorder.mainRecorderPanel.importTest'),
      onClick: (): Promise<void> => handleImportClick('Test')
    },
    {
      label: t('recorder.mainRecorderPanel.importSuite'),
      onClick: (): Promise<void> => handleImportClick('Suite')
    },
    {
      label: t('recorder.mainRecorderPanel.importProject'),
      onClick: (): Promise<void> => handleImportClick('Project')
    },
    {
      label: t('recorder.mainRecorderPanel.exportTest'),
      onClick: (): Promise<void> => handleExportClick('Test')
    },
    {
      label: t('recorder.mainRecorderPanel.exportSuite'),
      onClick: (): Promise<void> => handleExportClick('Suite')
    },
    {
      label: t('recorder.mainRecorderPanel.exportProject'),
      onClick: (): Promise<void> => handleExportClick('Project')
    }
  ]

  if (!activeSuiteName) {
    return (
      <div className="flex-none border-b border-neutral-bdr pb-4 space-y-1">
        <h2 className="text-sm font-semibold text-neutral-dark">{t('recorder.mainRecorderPanel.noSuite')}</h2>
        <p className="text-sm text-neutral-mid">{t('recorder.mainRecorderPanel.emptyHelper')}</p>
      </div>
    )
  }

  return (
    <div className="flex-none border-b border-neutral-bdr pb-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-dark">
          {t('recorder.mainRecorderPanel.suite', { activeSuiteName })}
        </h2>
      </div>
      <div className="flex items-center space-x-4">
        <Tooltip content={t('tooltips.recorder.testName')} position="right" className="flex-1">
          <InputField
            value={activeTest?.name ?? ''}
            onChange={onTestNameChange}
            placeholder={t('recorder.mainRecorderPanel.testName')}
            disabled={!activeTest}
          />
        </Tooltip>
        <Tooltip content={t('tooltips.recorder.urlToRecord')} position="right" className="flex-1">
          <InputField
            value={activeTest?.url ?? ''}
            onChange={onUrlChange}
            placeholder={t('recorder.mainRecorderPanel.url')}
            disabled={!activeTest}
          />
        </Tooltip>
      </div>
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center space-x-2">
          <Tooltip content={t('tooltips.recorder.newTest')} position="right">
            <button
              onClick={onNewTest}
              disabled={!activeSuiteId}
              className={`text-xs px-2.5 py-1 rounded border border-neutral-bdr font-medium transition-colors ${
                !activeSuiteId
                  ? 'text-neutral-mid cursor-not-allowed bg-white'
                  : 'text-neutral-dk bg-white hover:bg-neutral-50'
              }`}
            >
              {t('recorder.mainRecorderPanel.newTest')}
            </button>
          </Tooltip>
          <Tooltip content={t('tooltips.recorder.more')} position="right">
            <Dropdown
              buttonText={t('recorder.mainRecorderPanel.more')}
              options={moreOptions}
              defaultOption={0}
              disabled={false}
            />
          </Tooltip>
        </div>
        <div className="flex items-center space-x-2">
          <Tooltip content={t('tooltips.recorder.record')} position="top">
            <button
              onClick={onStartRecording}
              disabled={!activeTest || isRecording}
              aria-label={t('recorder.mainRecorderPanel.record')}
              className={`w-9 h-9 flex items-center justify-center rounded-full transition-colors ${
                !activeTest || isRecording
                  ? 'text-neutral-300 cursor-not-allowed'
                  : 'text-red-500 hover:bg-red-50'
              }`}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <circle cx="12" cy="12" r="8" />
              </svg>
            </button>
          </Tooltip>
          <Tooltip content={t('tooltips.recorder.run')} position="top">
            <button
              onClick={onRunTest}
              disabled={!activeTest || isRecording || isRunning}
              aria-label={t('recorder.mainRecorderPanel.run')}
              className={`w-9 h-9 flex items-center justify-center rounded-full transition-colors ${
                !activeTest || isRecording || isRunning
                  ? 'text-neutral-300 cursor-not-allowed'
                  : 'text-green-600 hover:bg-green-50'
              }`}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <polygon points="5,3 19,12 5,21" />
              </svg>
            </button>
          </Tooltip>
          <Tooltip content={t('tooltips.recorder.stop')} position="top">
            <button
              onClick={onStopRecording}
              disabled={!isRecording}
              aria-label={t('recorder.mainRecorderPanel.stop')}
              className={`w-9 h-9 flex items-center justify-center rounded-full transition-colors ${
                !isRecording
                  ? 'text-neutral-300 cursor-not-allowed'
                  : 'text-neutral-dark hover:bg-neutral-100'
              }`}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <rect x="4" y="4" width="16" height="16" rx="2" />
              </svg>
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  )
}

export default MainRecorderPanel
