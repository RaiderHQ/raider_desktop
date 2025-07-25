import React from 'react'
import { useTranslation } from 'react-i18next'

const GeneralSettings: React.FC = () => {
  const { t, i18n } = useTranslation()

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng)
  }

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">{t('settings.general.title')}</h2>
      <p className="mb-4">{t('settings.general.description')}</p>
      <div className="flex items-center">
        <label htmlFor="language-select" className="mr-4">
          {t('settings.general.language.label')}:
        </label>
        <select
          id="language-select"
          className="p-2 border rounded"
          value={i18n.language}
          onChange={(e) => changeLanguage(e.target.value)}
        >
          <option value="en">English</option>
          <option value="da">Danish</option>
          <option value="es">Spanish</option>
          <option value="it">Italian</option>
          <option value="ro">Romanian</option>
          <option value="lt">Lithuanian</option>
        </select>
      </div>
    </div>
  )
}

export default GeneralSettings
