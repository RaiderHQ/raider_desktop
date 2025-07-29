import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import useLanguageStore from '@foundation/Stores/languageStore'
import Button from '@components/Button'

const GeneralSettings: React.FC = () => {
  const { t, i18n } = useTranslation()
  const { language, setLanguage } = useLanguageStore()
  const [selectedLanguage, setSelectedLanguage] = useState(language)

  useEffect(() => {
    setSelectedLanguage(language)
  }, [language])

  const handleSave = (): void => {
    setLanguage(selectedLanguage)
    i18n.changeLanguage(selectedLanguage)
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
          value={selectedLanguage}
          onChange={(e) => setSelectedLanguage(e.target.value)}
        >
          <option value="en">English</option>
          <option value="da">Dansk</option>
          <option value="es">Español</option>
          <option value="it">Italiano</option>
          <option value="ro">Română</option>
          <option value="lt">Lietuvių</option>
        </select>
      </div>
      <div className="mt-4">
        <Button onClick={handleSave} type="primary">
          {t('settings.general.save')}
        </Button>
      </div>
    </div>
  )
}

export default GeneralSettings
