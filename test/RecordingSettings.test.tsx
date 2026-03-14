import { render, screen, fireEvent, act } from '@testing-library/react'
import RecordingSettings from '@pages/RecorderSettings'
import '@testing-library/jest-dom'
import { vi } from 'vitest'

vi.mock('react-i18next', () => ({
  useTranslation: (): { t: (key: string) => string } => ({
    t: (key: string): string => key
  })
}))

const mockApi = {
  updateRecordingSettings: vi.fn().mockResolvedValue(undefined)
}

beforeEach(() => {
  // @ts-expect-error - Mocking window.api
  window.api = mockApi
  vi.clearAllMocks()
  localStorage.clear()
})

describe('RecordingSettings Page', (): void => {
  it('renders correctly', async (): Promise<void> => {
    await act(async () => {
      render(<RecordingSettings />)
    })

    expect(screen.getByText('settings.recording.title')).toBeInTheDocument()
    expect(screen.getByLabelText('settings.recording.implicitWait.label')).toBeInTheDocument()
    expect(screen.getByLabelText('settings.recording.explicitWait.label')).toBeInTheDocument()
  })

  describe('Wait validation', () => {
    it('does not allow negative implicit wait values', async () => {
      await act(async () => {
        render(<RecordingSettings />)
      })

      const implicitInput = screen.getByLabelText(
        'settings.recording.implicitWait.label'
      ) as HTMLInputElement
      expect(implicitInput.min).toBe('0')
    })
  })

  it('updates settings when button is clicked', async () => {
    await act(async () => {
      render(<RecordingSettings />)
    })

    const implicitInput = screen.getByLabelText('settings.recording.implicitWait.label')
    await act(async () => {
      fireEvent.change(implicitInput, { target: { value: '5' } })
    })

    const updateButton = screen.getByText('settings.recording.updateRecordingSettingsButton')
    await act(async () => {
      fireEvent.click(updateButton)
    })

    expect(mockApi.updateRecordingSettings).toHaveBeenCalledWith({
      implicitWait: 5,
      explicitWait: 30
    })
  })
})
