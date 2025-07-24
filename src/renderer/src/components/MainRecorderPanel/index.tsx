import React from 'react'
import Button from '@components/Button'
import InputField from '@components/InputField'
import Dropdown from '@components/Dropdown'
import type { Test } from '@foundation/Types/test'
import toast from 'react-hot-toast'

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
  onSaveTest: () => void
  onNewTest: () => void
  onExportTest: () => Promise<{ success: boolean; path?: string; error?: string }>
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
  onSaveTest,
  onNewTest,
  onExportTest,
  activeSuiteId
}) => {
  const handleSaveClick = (): void => {
    onSaveTest()
    toast.success('Test saved successfully!')
  }

  const handleExportClick = async (exportType: 'Test' | 'Suite' | 'Project'): Promise<void> => {
    let result
    switch (exportType) {
      case 'Test':
        result = await onExportTest()
        break
      case 'Suite':
        toast.success('Export Suite functionality coming soon!')
        return
      case 'Project':
        toast.success('Export Project functionality coming soon!')
        return
      default:
        return
    }

    if (result.success) {
      toast.success(`${exportType} exported to ${result.path}`)
    } else {
      toast.error(`Export failed: ${result.error}`)
    }
  }

  const exportOptions = [
    { label: 'Export Test', onClick: () => handleExportClick('Test') },
    { label: 'Export Suite', onClick: () => handleExportClick('Suite') },
    { label: 'Export Project', onClick: () => handleExportClick('Project') }
  ]

  const importOptions = [
    { label: 'Import Test', onClick: () => toast.success('Import Test functionality coming soon!') },
    { label: 'Import Suite', onClick: () => toast.success('Import Suite functionality coming soon!') },
    {
      label: 'Import Project',
      onClick: () => toast.success('Import Project functionality coming soon!')
    }
  ]

  return (
    <div className="flex-none pb-1 pr-1">
      <div className="relative">
        <div className="relative flex flex-col border border-black rounded-lg bg-white p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">
              {activeSuiteName ? `Suite: ${activeSuiteName}` : 'No Suite Selected'}
            </h2>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex-1">
              <InputField
                value={activeTest?.name ?? ''}
                onChange={onTestNameChange}
                placeholder="Test Name"
                disabled={!activeTest}
              />
            </div>
            <div className="flex-1">
              <InputField
                value={activeTest?.url ?? ''}
                onChange={onUrlChange}
                placeholder="URL to Record"
                disabled={!activeTest}
              />
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-gray-200 pt-4">
            <div className="flex items-center space-x-2">
              <Button
                onClick={onStartRecording}
                disabled={!activeTest || isRecording}
                type={isRecording ? 'disabled' : 'primary'}
              >
                Record
              </Button>
              <Button
                onClick={onRunTest}
                disabled={!activeTest || isRecording || isRunning}
                type={!activeTest || isRecording || isRunning ? 'disabled' : 'success'}
              >
                Run
              </Button>
              <Button
                onClick={onStopRecording}
                disabled={!isRecording}
                type={!isRecording ? 'disabled' : 'secondary'}
              >
                Stop
              </Button>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                onClick={onNewTest}
                disabled={!activeSuiteId}
                type={!activeSuiteId ? 'disabled' : 'secondary'}
              >
                New Test
              </Button>
              <Button
                onClick={handleSaveClick}
                disabled={!activeTest || isRecording}
                type={!activeTest || isRecording ? 'disabled' : 'primary'}
              >
                Save Test
              </Button>
              <Dropdown buttonText="Import" options={importOptions} defaultOption={2} />
              <Dropdown
                buttonText="Export"
                options={exportOptions}
                defaultOption={2}
                disabled={!activeTest || isRecording}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default MainRecorderPanel
