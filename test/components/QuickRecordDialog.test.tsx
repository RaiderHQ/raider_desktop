import { render, screen, act, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import toast from 'react-hot-toast'
import QuickRecordDialog from '@components/QuickRecordDialog'
import useProjectStore from '@foundation/Stores/projectStore'
import useRecorderStore from '@foundation/Stores/recorderStore'
import useRubyStore from '@foundation/Stores/rubyStore'

vi.mock('react-i18next', () => ({
  useTranslation: (): { t: (key: string) => string } => ({ t: (key: string): string => key })
}))
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn() } }))
vi.mock('@components/RubyInstallModal', () => ({
  default: (): JSX.Element => <div>ruby-install-modal</div>
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const original = await vi.importActual('react-router-dom')
  return { ...original, useNavigate: (): (() => void) => mockNavigate }
})

const api = {
  createQuickProject: vi.fn(),
  setActiveProject: vi.fn().mockResolvedValue({ success: true }),
  readDirectory: vi.fn().mockResolvedValue([]),
  closeApp: vi.fn()
}

const fill = (): void => {
  fireEvent.change(screen.getByPlaceholderText('quickRecord.urlPlaceholder'), {
    target: { value: 'https://example.com' }
  })
  fireEvent.change(screen.getByPlaceholderText('quickRecord.namePlaceholder'), {
    target: { value: 'Checkout' }
  })
}

const renderDialog = async (onClose = vi.fn()): Promise<typeof onClose> => {
  await act(async () => {
    render(
      <MemoryRouter>
        <QuickRecordDialog onClose={onClose} />
      </MemoryRouter>
    )
  })
  return onClose
}

beforeEach(() => {
  vi.clearAllMocks()
  // @ts-expect-error - Mocking window.api
  window.api = api
  useRubyStore.setState({ rubyCommand: '/usr/bin/ruby' })
  useProjectStore.setState({ projectPath: null })
  useRecorderStore.getState().resetForProject()
})

describe('QuickRecordDialog', (): void => {
  it('opens the Ruby install flow when Ruby is missing', async (): Promise<void> => {
    useRubyStore.setState({ rubyCommand: null })
    await renderDialog()
    expect(screen.getByText('ruby-install-modal')).toBeInTheDocument()
    expect(screen.queryByText('quickRecord.start')).not.toBeInTheDocument()
  })

  it('disables Start until both fields are filled', async (): Promise<void> => {
    await renderDialog()
    const start = screen.getByText('quickRecord.start')
    expect(start).toBeDisabled()
    fireEvent.change(screen.getByPlaceholderText('quickRecord.urlPlaceholder'), {
      target: { value: 'https://example.com' }
    })
    expect(start).toBeDisabled()
    fireEvent.change(screen.getByPlaceholderText('quickRecord.namePlaceholder'), {
      target: { value: 'Checkout' }
    })
    expect(start).toBeEnabled()
  })

  it('creates the project, activates it, starts the draft and goes to the new test', async (): Promise<void> => {
    api.createQuickProject.mockResolvedValue({ success: true, projectPath: '/quick/p' })
    const onClose = await renderDialog()
    fill()
    await act(async () => {
      fireEvent.click(screen.getByText('quickRecord.start'))
    })
    expect(api.createQuickProject).toHaveBeenCalledWith('https://example.com', '/usr/bin/ruby')
    expect(useProjectStore.getState().projectPath).toBe('/quick/p')
    const draft = useRecorderStore.getState().draftTest
    expect(draft?.name).toBe('Checkout')
    expect(draft?.url).toBe('https://example.com')
    expect(mockNavigate).toHaveBeenCalledWith('/overview/tests/new')
    expect(onClose).toHaveBeenCalled()
  })

  it('shows the error and stays put when creating fails', async (): Promise<void> => {
    api.createQuickProject.mockResolvedValue({ success: false, error: 'nope' })
    await renderDialog()
    fill()
    await act(async () => {
      fireEvent.click(screen.getByText('quickRecord.start'))
    })
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(mockNavigate).not.toHaveBeenCalled()
    expect(useProjectStore.getState().projectPath).toBeNull()
    expect(useRecorderStore.getState().draftTest).toBeNull()
    expect(screen.getByText('quickRecord.start')).toBeEnabled()
  })
})
