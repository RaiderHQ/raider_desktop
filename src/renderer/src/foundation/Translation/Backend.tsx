import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import en from '@assets/translations/en.json'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
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
