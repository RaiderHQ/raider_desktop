import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import Button from '@components/Button'

const RecordingSettings: React.FC = () => {
  const { t } = useTranslation()
  const [implicitWait, setImplicitWait] = useState(0)
  const [explicitWait, setExplicitWait] = useState(30)
  const [isUpdating, setIsUpdating] = useState(false)

  useEffect(() => {
    const savedImplicitWait = localStorage.getItem('implicitWait')
    if (savedImplicitWait) {
      setImplicitWait(Number(savedImplicitWait))
    }
    const savedExplicitWait = localStorage.getItem('explicitWait')
    if (savedExplicitWait) {
      setExplicitWait(Number(savedExplicitWait))
    }
  }, [])

  const handleImplicitWaitChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const val = Number(event.target.value)
    if (val >= 0) setImplicitWait(val)
  }

  const handleExplicitWaitChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const val = Number(event.target.value)
    if (val >= 0) setExplicitWait(val)
  }

  const handleUpdateClick = async (): Promise<void> => {
    setIsUpdating(true)
    try {
      await window.api.updateRecordingSettings({ implicitWait, explicitWait })
      localStorage.setItem('implicitWait', implicitWait.toString())
      localStorage.setItem('explicitWait', explicitWait.toString())
      toast.success(t('settings.recording.recordingUpdateSuccess'))
    } catch (error) {
      toast.error(`${t('settings.recording.error.unexpected')} : ${error}`)
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold">{t('settings.recording.title')}</h2>
      <p className="mb-4">{t('settings.recording.description')}</p>

      <div className="border border-neutral-bdr rounded-lg p-4">
        <label htmlFor="implicit-wait" className="font-medium mr-2">
          {t('settings.recording.implicitWait.label')}
        </label>
        <input
          type="number"
          id="implicit-wait"
          value={implicitWait}
          onChange={handleImplicitWaitChange}
          className="border p-1 rounded mt-2"
          min="0"
        />
        <p className="text-sm text-neutral-mid mt-1">
          {t('settings.recording.implicitWait.description')}
        </p>
      </div>

      <div className="border border-neutral-bdr rounded-lg p-4 mt-4">
        <label htmlFor="explicit-wait" className="font-medium mr-2">
          {t('settings.recording.explicitWait.label')}
        </label>
        <input
          type="number"
          id="explicit-wait"
          value={explicitWait}
          onChange={handleExplicitWaitChange}
          className="border p-1 rounded mt-2"
          min="0"
        />
        <p className="text-sm text-neutral-mid mt-1">
          {t('settings.recording.explicitWait.description')}
        </p>
      </div>

      <div className="mt-4">
        <Button onClick={handleUpdateClick} type="primary" disabled={isUpdating}>
          {t('settings.recording.updateRecordingSettingsButton')}
        </Button>
      </div>
    </div>
  )
}

export default RecordingSettings
