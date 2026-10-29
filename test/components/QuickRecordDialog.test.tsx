import { render, screen, act, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router'
import toast from 'react-hot-toast'
import QuickRecordDialog from '@components/QuickRecordDialog'
import useProjectStore from '@foundation/Stores/projectStore'
import useRecorderStore from '@foundation/Stores/recorderStore'
import useRubyStore from '@foundation/Stores/rubyStore'

vi.mock('react-i18next', () => ({
  useTranslation: (): { t: (key: string) => string } => ({ t: (key: string): string => key })
}))
vi.mock('react-hot-toast', () => ({
  default: { error: vi.fn(), loading: vi.fn(), success: vi.fn() }
}))
vi.mock('@components/RubyInstallModal', () => ({
  default: (): JSX.Element => <div>ruby-install-modal</div>
}))
vi.mock('@components/RubyGemsInstallModal', () => ({
  default: ({
    missingGems,
    onInstall,
    onClose
  }: {
    missingGems: string[]
    onInstall: () => void
    onClose: () => void
  }): JSX.Element => (
    <div>
      gems-install-modal {missingGems.join(',')}
      <button onClick={onInstall}>install</button>
      <button onClick={onClose}>close</button>
    </div>
  )
}))

const mockNavigate = vi.fn()
vi.mock('react-router', async () => {
  const original = await vi.importActual('react-router')
  return { ...original, useNavigate: (): (() => void) => mockNavigate }
})

const api = {
  createQuickProject: vi.fn(),
  isRubyInstalled: vi.fn(),
  installGems: vi.fn(),
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
  api.isRubyInstalled.mockResolvedValue({ success: true, rubyCommand: '/usr/bin/ruby' })
  api.installGems.mockResolvedValue({ success: true })
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

  it('prefixes https:// when the address has no scheme', async (): Promise<void> => {
    api.createQuickProject.mockResolvedValue({ success: true, projectPath: '/quick/p' })
    await renderDialog()
    fireEvent.change(screen.getByPlaceholderText('quickRecord.urlPlaceholder'), {
      target: { value: 'example.com' }
    })
    fireEvent.change(screen.getByPlaceholderText('quickRecord.namePlaceholder'), {
      target: { value: 'Checkout' }
    })
    await act(async () => {
      fireEvent.click(screen.getByText('quickRecord.start'))
    })
    expect(api.createQuickProject).toHaveBeenCalledWith('https://example.com', '/usr/bin/ruby')
    expect(useRecorderStore.getState().draftTest?.url).toBe('https://example.com')
  })

  it("when Raider's gems are missing, shows the setup help, not the raw error", async (): Promise<void> => {
    api.createQuickProject.mockResolvedValue({ success: false, error: 'raider: command not found' })
    api.isRubyInstalled.mockResolvedValue({
      success: false,
      rubyCommand: '/usr/bin/ruby',
      missingGems: ['ruby_raider']
    })
    await renderDialog()
    fill()
    await act(async () => {
      fireEvent.click(screen.getByText('quickRecord.start'))
    })
    expect(screen.getByText(/gems-install-modal ruby_raider/)).toBeInTheDocument()
    expect(toast.error).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(screen.getByText('install'))
    })
    expect(api.installGems).toHaveBeenCalledWith('/usr/bin/ruby', ['ruby_raider'])
    // Back to the form, as it was
    expect(screen.getByPlaceholderText('quickRecord.urlPlaceholder')).toHaveValue(
      'https://example.com'
    )
  })

  it('with the gems in place, a failure shows its error', async (): Promise<void> => {
    api.createQuickProject.mockResolvedValue({ success: false, error: 'disk full' })
    await renderDialog()
    fill()
    await act(async () => {
      fireEvent.click(screen.getByText('quickRecord.start'))
    })
    expect(screen.queryByText(/gems-install-modal/)).not.toBeInTheDocument()
    expect(toast.error).toHaveBeenCalledWith('quickRecord.error')
  })
})
