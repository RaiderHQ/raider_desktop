import { render, screen, act, fireEvent, waitFor } from '@testing-library/react'
import Overview from '@pages/Overview'
import '@testing-library/jest-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import useProjectStore from '@foundation/Stores/projectStore'

// Mocking necessary modules and hooks
vi.mock('react-i18next', () => ({
  useTranslation: (): { t: (key: string) => string } => ({
    t: (key: string): string => key
  })
}))

vi.mock('@components/Library/Folder', () => ({
  default: ({ name }: { name: string | undefined }): JSX.Element => (
    <div data-testid="folder">{name}</div>
  )
}))

vi.mock('@components/ScaffoldPanel', () => ({
  default: (): JSX.Element => <div data-testid="scaffold-panel">ScaffoldPanel</div>
}))

vi.mock('@components/Editor', () => ({
  default: (): JSX.Element => <div data-testid="editor">Editor</div>
}))

vi.mock('@foundation/helpers', () => ({
  getFileLanguage: (): string => 'ruby'
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const original = await vi.importActual('react-router-dom')
  return {
    ...original,
    useNavigate: (): (() => void) => mockNavigate
  }
})

vi.mock('@foundation/Stores/rubyStore', () => ({
  __esModule: true,
  default: vi.fn(() => ({
    rubyCommand: '/usr/bin/ruby',
    setRubyCommand: vi.fn()
  }))
}))

const mockApi = {
  readDirectory: vi.fn().mockResolvedValue([]),
  onTestRunStatus: vi.fn(),
  removeTestRunStatusListener: vi.fn(),
  scaffoldGenerate: vi.fn().mockResolvedValue({ success: true, output: '' }),
  updateBrowserUrl: vi.fn().mockResolvedValue({ success: true }),
  updateBrowserType: vi.fn().mockResolvedValue({ success: true }),
  updateBrowserOptions: vi.fn().mockResolvedValue({ success: true }),
  updateHeadlessMode: vi.fn().mockResolvedValue({ success: true }),
  getProjectConfig: vi.fn().mockResolvedValue({ success: true, config: {} }),
  runRaiderTests: vi.fn().mockResolvedValue({ success: true }),
  runRakeTask: vi.fn().mockResolvedValue({ success: true }),
  rerunFailedTests: vi.fn().mockResolvedValue({ success: true }),
  isMobileProject: vi.fn(),
  getMobileCapabilities: vi.fn().mockResolvedValue({ success: true, capabilities: {} }),
  updateTimeout: vi.fn().mockResolvedValue({ success: true }),
  updateViewport: vi.fn().mockResolvedValue({ success: true }),
  updateDebugMode: vi.fn().mockResolvedValue({ success: true }),
  updateMobileCapabilities: vi.fn().mockResolvedValue({ success: true }),
  startAppium: vi.fn().mockResolvedValue({ success: true }),
  updatePaths: vi.fn().mockResolvedValue({ success: true })
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  // @ts-expect-error - Mocking window.api
  window.api = mockApi
  useProjectStore.setState({ projectPath: '/fake/project', files: [] })
})

const renderSettingsTab = async (): Promise<void> => {
  mockApi.isMobileProject.mockResolvedValue({ success: true, isMobileProject: false })
  await act(async () => {
    render(
      <MemoryRouter>
        <Overview />
      </MemoryRouter>
    )
  })
  fireEvent.click(screen.getByText('overview.tabs.settings'))
  await waitFor(() => {
    expect(screen.getByText('settings.section.timeout')).toBeInTheDocument()
  })
}

describe('Project Settings in Tests view', (): void => {
  it('renders loading state initially when switching to Settings tab', async (): Promise<void> => {
    mockApi.isMobileProject.mockReturnValue(new Promise(() => {})) // Never resolves
    await act(async () => {
      render(
        <MemoryRouter>
          <Overview />
        </MemoryRouter>
      )
    })

    fireEvent.click(screen.getByText('overview.tabs.settings'))
    expect(screen.getByText('settings.loading')).toBeInTheDocument()
  })

  it('renders web settings for a web project', async (): Promise<void> => {
    await renderSettingsTab()

    expect(screen.getByText('settings.section.timeout')).toBeInTheDocument()
    expect(screen.getByText('settings.section.viewport')).toBeInTheDocument()
    expect(screen.getByText('settings.section.browserOptions')).toBeInTheDocument()
    expect(screen.getByText('settings.section.paths')).toBeInTheDocument()
  })

  it('renders mobile settings for a mobile project', async (): Promise<void> => {
    mockApi.isMobileProject.mockResolvedValue({
      success: true,
      isMobileProject: true
    })
    mockApi.getMobileCapabilities.mockResolvedValue({
      success: true,
      capabilities: {}
    })
    await act(async () => {
      render(
        <MemoryRouter>
          <Overview />
        </MemoryRouter>
      )
    })

    fireEvent.click(screen.getByText('overview.tabs.settings'))
    await waitFor(() => {
      expect(screen.getByText('settings.section.appiumSettings')).toBeInTheDocument()
    })
  })

  it('calls updateTimeout when timeout is updated', async (): Promise<void> => {
    await renderSettingsTab()

    const details = screen.getByText('settings.section.timeout').closest('details')!
    fireEvent.click(details.querySelector('summary')!)

    const timeoutInput = screen.getByLabelText('settings.timeout.label')
    fireEvent.change(timeoutInput, { target: { value: '60' } })
    fireEvent.click(screen.getByText('settings.timeout.updateButton'))

    await waitFor(() => {
      expect(mockApi.updateTimeout).toHaveBeenCalledWith('/fake/project', 60)
    })
  })
})
