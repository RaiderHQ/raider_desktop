import { render, screen, fireEvent, act } from '@testing-library/react'
import RecordingSettings from '@pages/RecorderSettings'
import '@testing-library/jest-dom'
import { vi } from 'vitest'
import toast from 'react-hot-toast'

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() }
}))

vi.mock('react-i18next', () => ({
  useTranslation: (): { t: (key: string) => string } => ({
    t: (key: string): string => key
  })
}))

const mockApi = {
  updateRecordingSettings: vi.fn().mockResolvedValue({ success: true }),
  getRecorderSettings: vi.fn().mockResolvedValue({ implicitWait: 3, explicitWait: 25 })
}

beforeEach(() => {
  // @ts-expect-error - Mocking window.api
  window.api = mockApi
  vi.clearAllMocks()
  mockApi.updateRecordingSettings.mockResolvedValue({ success: true })
  mockApi.getRecorderSettings.mockResolvedValue({ implicitWait: 3, explicitWait: 25 })
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
      explicitWait: 25
    })
  })

  it('shows wait values from project settings and never reads localStorage', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem')
    await act(async () => {
      render(<RecordingSettings />)
    })

    expect(screen.getByLabelText('settings.recording.implicitWait.label')).toHaveValue(3)
    expect(screen.getByLabelText('settings.recording.explicitWait.label')).toHaveValue(25)
    expect(getItem).not.toHaveBeenCalledWith('implicitWait')
    expect(getItem).not.toHaveBeenCalledWith('explicitWait')
    getItem.mockRestore()
  })

  it('shows an error toast when saving fails', async () => {
    mockApi.updateRecordingSettings.mockResolvedValue({ success: false, error: 'No project open' })
    await act(async () => {
      render(<RecordingSettings />)
    })
    await act(async () => {
      fireEvent.click(screen.getByText('settings.recording.updateRecordingSettingsButton'))
    })

    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('No project open'))
    expect(toast.success).not.toHaveBeenCalled()
  })
})
