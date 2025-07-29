import { render, screen, fireEvent, act } from '@testing-library/react'
import RecordingSettings from '@pages/RecorderSettings'
import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mocking necessary modules and hooks
vi.mock('react-i18next', () => ({
  useTranslation: (): { t: (key: string) => string } => ({
    t: (key: string): string => key
  })
}))

const mockApi = {
  getSelectorPriorities: vi.fn().mockResolvedValue(['id', 'name', 'css']),
  updateRecordingSettings: vi.fn(),
  saveSelectorPriorities: vi.fn()
}

beforeEach(() => {
  // @ts-expect-error - Mocking window.api
  window.api = mockApi
})

describe('RecordingSettings Page', (): void => {
  it('renders correctly', async (): Promise<void> => {
    await act(async () => {
      render(<RecordingSettings />)
    })

    expect(screen.getByText('settings.recording.title')).toBeInTheDocument()
    expect(screen.getByLabelText('settings.recording.implicitWait.label')).toBeInTheDocument()
    expect(screen.getByLabelText('settings.recording.explicitWait.label')).toBeInTheDocument()
    expect(screen.getByText('Selector Priorities')).toBeInTheDocument()
  })

  it('loads initial selector priorities', async (): Promise<void> => {
    await act(async () => {
      render(<RecordingSettings />)
    })

    expect(await screen.findByText('id')).toBeInTheDocument()
    expect(await screen.findByText('name')).toBeInTheDocument()
    expect(await screen.findByText('css')).toBeInTheDocument()
  })

  it('adds and removes a selector', async (): Promise<void> => {
    await act(async () => {
      render(<RecordingSettings />)
    })

    const newSelectorInput = screen.getByPlaceholderText('e.g., data-testid')
    const addButton = screen.getByText('Add')

    await act(async () => {
      fireEvent.change(newSelectorInput, { target: { value: 'data-testid' } })
      fireEvent.click(addButton)
    })

    expect(screen.getByText('data-testid')).toBeInTheDocument()

    const deleteButton = screen.getAllByText('Delete')[3] // Assuming it's the last one
    await act(async () => {
      fireEvent.click(deleteButton)
    })

    expect(screen.queryByText('data-testid')).not.toBeInTheDocument()
  })
})
