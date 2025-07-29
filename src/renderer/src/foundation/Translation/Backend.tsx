import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import en from '@assets/translations/en.json'
import da from '@assets/translations/da.json'
import es from '@assets/translations/es.json'
import it from '@assets/translations/it.json'
import ro from '@assets/translations/ro.json'
import lt from '@assets/translations/lt.json'
import useLanguageStore from '@foundation/Stores/languageStore'

const initialLanguage = useLanguageStore.getState().language

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    da: { translation: da },
    es: { translation: es },
    it: { translation: it },
    ro: { translation: ro },
    lt: { translation: lt }
  },
  lng: initialLanguage,
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false
  }
})
