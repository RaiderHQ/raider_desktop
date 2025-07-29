import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface LanguageState {
  language: string
  setLanguage: (language: string) => void
}

const useLanguageStore = create<LanguageState>()(
  persist(
    (set): LanguageState => ({
      language: 'en',
      setLanguage: (language: string): void => set({ language })
    }),
    {
      name: 'language-storage'
    }
  )
)

export default useLanguageStore
