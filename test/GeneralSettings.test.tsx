import { render, screen, fireEvent, act } from '@testing-library/react'
import GeneralSettings from '@pages/GeneralSettings'
import '@testing-library/jest-dom'
import { vi } from 'vitest'
import useLanguageStore from '@foundation/Stores/languageStore'

// Mocking necessary modules and hooks
vi.mock('react-i18next', () => ({
  useTranslation: (): { t: (key: string) => string; i18n: { changeLanguage: () => void } } => ({
    t: (key: string): string => key,
    i18n: {
      changeLanguage: vi.fn()
    }
  })
}))

const setLanguage = vi.fn()
// @ts-ignore - Mocking the zustand store for testing purposes.
useLanguageStore.setState({ language: 'en', setLanguage })

describe('GeneralSettings Page', () => {
  it('renders correctly', async () => {
    await act(async () => {
      render(<GeneralSettings />)
    })
    expect(screen.getByText('settings.general.title')).toBeInTheDocument()
    expect(screen.getByLabelText('settings.general.language.label:')).toHaveValue('en')
  })

  it('updates language on selection and save', async () => {
    await act(async () => {
      render(<GeneralSettings />)
    })

    const languageSelect = screen.getByLabelText('settings.general.language.label:')
    await act(async () => {
      fireEvent.change(languageSelect, { target: { value: 'es' } })
    })
    expect(languageSelect).toHaveValue('es')

    const saveButton = screen.getByText('settings.general.save')
    await act(async () => {
      fireEvent.click(saveButton)
    })
    expect(setLanguage).toHaveBeenCalledWith('es')
  })
})
