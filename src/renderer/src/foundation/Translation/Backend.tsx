import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import en from '@assets/translations/en.json'
import da from '@assets/translations/da.json'

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    da: { translation: da }
  },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false
  }
})
