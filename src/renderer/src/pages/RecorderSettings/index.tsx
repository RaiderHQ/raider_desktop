import React from 'react'
import { useTranslation } from 'react-i18next'

const RecordingSettings: React.FC = () => {
  const { t } = useTranslation()

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold">{t('settings.recording.title')}</h2>
      <p>{t('settings.recording.description')}</p>
      {/* Recording settings content will go here */}
    </div>
  )
}

export default RecordingSettings
