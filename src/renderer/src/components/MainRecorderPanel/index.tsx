import React from 'react'
import Button from '@components/Button'
import InputField from '@components/InputField'
import Dropdown from '@components/Dropdown'
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
      <div className="flex-none pb-1 pr-1">
        <div className="relative">
          <div className="relative flex flex-col border border-neutral-bdr rounded-lg bg-white p-4 space-y-2">
            <h2 className="text-xl font-semibold">
              {t('recorder.mainRecorderPanel.noSuite')}
            </h2>
            <p className="text-sm text-neutral-mid">
              {t('recorder.mainRecorderPanel.emptyHelper')}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-none pb-1 pr-1">
      <div className="relative">
        <div className="relative flex flex-col border border-neutral-bdr rounded-lg bg-white p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">
              {t('recorder.mainRecorderPanel.suite', { activeSuiteName })}
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
          <div className="flex items-center justify-between border-t border-neutral-bdr pt-4">
            <div className="flex items-center space-x-2">
              <Button
                onClick={onNewTest}
                disabled={!activeSuiteId}
                type={!activeSuiteId ? 'disabled' : 'secondary'}
              >
                {t('recorder.mainRecorderPanel.newTest')}
              </Button>
              <Dropdown
                buttonText={t('recorder.mainRecorderPanel.more')}
                options={moreOptions}
                defaultOption={0}
                disabled={false}
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
