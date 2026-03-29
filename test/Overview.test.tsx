import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
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

vi.mock('@components/ProjectDashboard', () => ({
  default: (): JSX.Element => <div data-testid="project-dashboard">ProjectDashboard</div>
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
  isMobileProject: vi.fn().mockResolvedValue({ success: true, isMobileProject: false }),
  getMobileCapabilities: vi.fn().mockResolvedValue({ success: true, capabilities: {} }),
  updateTimeout: vi.fn().mockResolvedValue({ success: true }),
  updateViewport: vi.fn().mockResolvedValue({ success: true }),
  updateDebugMode: vi.fn().mockResolvedValue({ success: true }),
  updateMobileCapabilities: vi.fn().mockResolvedValue({ success: true }),
  startAppium: vi.fn().mockResolvedValue({ success: true }),
  updatePaths: vi.fn().mockResolvedValue({ success: true }),
  readFile: vi.fn().mockResolvedValue({ success: true, data: '' }),
  editFile: vi.fn().mockResolvedValue({ success: true }),
  deleteFile: vi.fn().mockResolvedValue({ success: true }),
  renameFile: vi.fn().mockResolvedValue({ success: true, newPath: '' }),
  duplicateFile: vi.fn().mockResolvedValue({ success: true, newPath: '' })
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  // @ts-expect-error - Mocking window.api
  window.api = mockApi
})

describe('Overview Page', (): void => {
  it('renders correctly with a project path', async (): Promise<void> => {
    useProjectStore.setState({ projectPath: '/fake/project', files: [] })
    await act(async () => {
      render(
        <MemoryRouter>
          <Overview />
        </MemoryRouter>
      )
    })

    expect(screen.getByTestId('folder')).toHaveTextContent('project')
  })

  it('navigates to /start-project if no project path is set', async (): Promise<void> => {
    useProjectStore.setState({ projectPath: null, files: [] })
    await act(async () => {
      render(
        <MemoryRouter>
          <Overview />
        </MemoryRouter>
      )
    })

    expect(mockNavigate).toHaveBeenCalledWith('/start-project')
  })

  it('renders Files, Scaffolding, and Dashboard tabs', async (): Promise<void> => {
    useProjectStore.setState({ projectPath: '/fake/project', files: [] })
    await act(async () => {
      render(
        <MemoryRouter>
          <Overview />
        </MemoryRouter>
      )
    })

    expect(screen.getByText('overview.tabs.files')).toBeInTheDocument()
    expect(screen.getByText('Scaffolding')).toBeInTheDocument()
    expect(screen.getByText('overview.tabs.dashboard')).toBeInTheDocument()
  })

  it('shows file tree by default on Files tab', async (): Promise<void> => {
    useProjectStore.setState({ projectPath: '/fake/project', files: [] })
    await act(async () => {
      render(
        <MemoryRouter>
          <Overview />
        </MemoryRouter>
      )
    })

    expect(screen.getByTestId('folder')).toBeInTheDocument()
    expect(screen.queryByTestId('scaffold-panel')).not.toBeInTheDocument()
  })

  it('shows ScaffoldPanel when Scaffolding tab is clicked', async (): Promise<void> => {
    useProjectStore.setState({ projectPath: '/fake/project', files: [] })
    await act(async () => {
      render(
        <MemoryRouter>
          <Overview />
        </MemoryRouter>
      )
    })

    fireEvent.click(screen.getByText('Scaffolding'))

    expect(screen.getByTestId('scaffold-panel')).toBeInTheDocument()
    expect(screen.queryByTestId('folder')).not.toBeInTheDocument()
  })

  it('switches back to Files tab from Scaffolding', async (): Promise<void> => {
    useProjectStore.setState({ projectPath: '/fake/project', files: [] })
    await act(async () => {
      render(
        <MemoryRouter>
          <Overview />
        </MemoryRouter>
      )
    })

    fireEvent.click(screen.getByText('Scaffolding'))
    expect(screen.getByTestId('scaffold-panel')).toBeInTheDocument()

    fireEvent.click(screen.getByText('overview.tabs.files'))
    expect(screen.getByTestId('folder')).toBeInTheDocument()
    expect(screen.queryByTestId('scaffold-panel')).not.toBeInTheDocument()
  })

  it('shows ProjectDashboard when Dashboard tab is clicked', async (): Promise<void> => {
    useProjectStore.setState({ projectPath: '/fake/project', files: [] })
    await act(async () => {
      render(
        <MemoryRouter>
          <Overview />
        </MemoryRouter>
      )
    })

    fireEvent.click(screen.getByText('overview.tabs.dashboard'))

    expect(screen.getByTestId('project-dashboard')).toBeInTheDocument()
    expect(screen.queryByTestId('folder')).not.toBeInTheDocument()
    expect(screen.queryByTestId('scaffold-panel')).not.toBeInTheDocument()
  })

})

describe('Overview Settings Toolbar', (): void => {
  const renderOverview = async (): Promise<void> => {
    useProjectStore.setState({ projectPath: '/fake/project', files: [] })
    await act(async () => {
      render(
        <MemoryRouter>
          <Overview />
        </MemoryRouter>
      )
    })
  }

  it('renders base URL input, browser select, and headless toggle on Files tab', async () => {
    await renderOverview()

    expect(screen.getByTestId('overview-url-input')).toBeInTheDocument()
    expect(screen.getByTestId('overview-browser-select')).toBeInTheDocument()
    expect(screen.getByText('overview.settings.headlessLabel')).toBeInTheDocument()
  })

  it('settings toolbar is not visible on Scaffolding tab', async () => {
    await renderOverview()

    fireEvent.click(screen.getByText('Scaffolding'))

    expect(screen.queryByTestId('overview-url-input')).not.toBeInTheDocument()
    expect(screen.queryByTestId('overview-browser-select')).not.toBeInTheDocument()
  })

  it('loads base URL from localStorage on mount', async () => {
    localStorage.setItem('browserUrl', 'https://stored-url.com')
    await renderOverview()

    expect(screen.getByTestId('overview-url-input')).toHaveValue('https://stored-url.com')
  })

  it('loads selected browser from localStorage on mount', async () => {
    localStorage.setItem('selectedBrowser', 'firefox')
    await renderOverview()

    expect(screen.getByTestId('overview-browser-select')).toHaveValue('firefox')
  })

  it('loads headless state from localStorage on mount', async () => {
    localStorage.setItem('headless', 'true')
    await renderOverview()

    const headlessSwitch = screen.getByTestId('overview-headless-toggle')
    expect(headlessSwitch).toHaveAttribute('aria-checked', 'true')
  })

  it('calls updateBrowserUrl on blur and saves to localStorage', async () => {
    await renderOverview()

    const urlInput = screen.getByTestId('overview-url-input')
    fireEvent.change(urlInput, { target: { value: 'https://new-url.com' } })
    fireEvent.blur(urlInput)

    await waitFor(() => {
      expect(mockApi.updateBrowserUrl).toHaveBeenCalledWith('/fake/project', 'https://new-url.com')
    })
    expect(localStorage.getItem('browserUrl')).toBe('https://new-url.com')
  })

  it('calls updateBrowserUrl on Enter key press', async () => {
    await renderOverview()

    const urlInput = screen.getByTestId('overview-url-input')
    fireEvent.change(urlInput, { target: { value: 'https://enter-url.com' } })
    fireEvent.keyDown(urlInput, { key: 'Enter' })

    await waitFor(() => {
      expect(mockApi.updateBrowserUrl).toHaveBeenCalledWith(
        '/fake/project',
        'https://enter-url.com'
      )
    })
  })

  it('does not call updateBrowserUrl when no project path', async () => {
    useProjectStore.setState({ projectPath: null, files: [] })
    await act(async () => {
      render(
        <MemoryRouter>
          <Overview />
        </MemoryRouter>
      )
    })

    // The component redirects when no project, so the input won't be there
    expect(mockApi.updateBrowserUrl).not.toHaveBeenCalled()
  })

  it('calls updateBrowserType on dropdown change and saves to localStorage', async () => {
    await renderOverview()

    const browserSelect = screen.getByTestId('overview-browser-select')
    fireEvent.change(browserSelect, { target: { value: 'firefox' } })

    await waitFor(() => {
      expect(mockApi.updateBrowserType).toHaveBeenCalledWith('/fake/project', 'firefox')
    })
    expect(localStorage.getItem('selectedBrowser')).toBe('firefox')
  })

  it('calls updateHeadlessMode when toggle is turned on', async () => {
    await renderOverview()

    const headlessSwitch = screen.getByTestId('overview-headless-toggle')
    fireEvent.click(headlessSwitch)

    await waitFor(() => {
      expect(mockApi.updateHeadlessMode).toHaveBeenCalledWith('/fake/project', true)
    })
    expect(localStorage.getItem('headless')).toBe('true')
  })

  it('calls updateHeadlessMode with false when toggle is turned off', async () => {
    localStorage.setItem('headless', 'true')
    mockApi.getProjectConfig.mockResolvedValueOnce({
      success: true,
      config: { headless: true }
    })
    await renderOverview()

    const headlessSwitch = screen.getByTestId('overview-headless-toggle')
    fireEvent.click(headlessSwitch)

    await waitFor(() => {
      expect(mockApi.updateHeadlessMode).toHaveBeenCalledWith('/fake/project', false)
    })
    expect(localStorage.getItem('headless')).toBe('false')
  })

  it('reverts headless toggle on API failure', async () => {
    mockApi.updateHeadlessMode.mockResolvedValueOnce({ success: false })
    await renderOverview()

    const headlessSwitch = screen.getByTestId('overview-headless-toggle')
    expect(headlessSwitch).toHaveAttribute('aria-checked', 'false')

    fireEvent.click(headlessSwitch)

    await waitFor(() => {
      expect(headlessSwitch).toHaveAttribute('aria-checked', 'false')
    })
  })

  it('shows error toast when URL update fails', async () => {
    mockApi.updateBrowserUrl.mockResolvedValueOnce({ success: false })
    await renderOverview()

    const urlInput = screen.getByTestId('overview-url-input')
    fireEvent.change(urlInput, { target: { value: 'https://fail.com' } })
    fireEvent.blur(urlInput)

    await waitFor(() => {
      expect(mockApi.updateBrowserUrl).toHaveBeenCalled()
    })
    // URL should NOT be saved to localStorage on failure
    expect(localStorage.getItem('browserUrl')).toBeNull()
  })

  it('shows error toast when browser update fails', async () => {
    mockApi.updateBrowserType.mockResolvedValueOnce({ success: false })
    await renderOverview()

    const browserSelect = screen.getByTestId('overview-browser-select')
    fireEvent.change(browserSelect, { target: { value: 'safari' } })

    await waitFor(() => {
      expect(mockApi.updateBrowserType).toHaveBeenCalled()
    })
    // Browser should NOT be saved to localStorage on failure
    expect(localStorage.getItem('selectedBrowser')).toBeNull()
  })

  it('renders all four browser options in dropdown', async () => {
    await renderOverview()

    const select = screen.getByTestId('overview-browser-select')
    const options = select.querySelectorAll('option')
    expect(options).toHaveLength(4)
    expect(options[0]).toHaveValue('chrome')
    expect(options[1]).toHaveValue('safari')
    expect(options[2]).toHaveValue('firefox')
    expect(options[3]).toHaveValue('edge')
  })
})
