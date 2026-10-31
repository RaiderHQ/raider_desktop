import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import Overview from '@pages/Overview'
import '@testing-library/jest-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router'
import useRecorderStore from '@foundation/Stores/recorderStore'
import useProjectStore from '@foundation/Stores/projectStore'
import toast from 'react-hot-toast'
import { useRunStore } from '@foundation/Stores/runStore'
import type { RunView } from '@foundation/run/runModel'

// Mocking necessary modules and hooks
vi.mock('react-i18next', () => ({
  useTranslation: (): { t: (key: string) => string } => ({
    t: (key: string): string => key
  })
}))

vi.mock('@components/Library/Folder', () => ({
  default: ({
    name,
    onRunTests,
    runDisabled
  }: {
    name: string | undefined
    onRunTests?: () => void
    runDisabled?: boolean
  }): JSX.Element => (
    <div data-testid="folder">
      {name}
      {onRunTests && (
        <button data-testid="run-tests" onClick={onRunTests} disabled={runDisabled} />
      )}
    </div>
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
vi.mock('react-router', async () => {
  const original = await vi.importActual('react-router')
  return {
    ...original,
    useNavigate: (): (() => void) => mockNavigate
  }
})

vi.mock('@foundation/Stores/rubyStore', () => ({
  __esModule: true,
  default: Object.assign(
    vi.fn(() => ({
      rubyCommand: '/usr/bin/ruby',
      setRubyCommand: vi.fn()
    })),
    { getState: (): { rubyCommand: string } => ({ rubyCommand: '/usr/bin/ruby' }) }
  )
}))

// The project opens on the Tests tab; most of these tests are about the Files tab
const openFilesTab = async (): Promise<void> => {
  await act(async () => {
    fireEvent.click(screen.getByText('overview.tabs.files'))
  })
}

const mockApi = {
  listProjectTests: vi.fn().mockResolvedValue([]),
  getSuites: vi.fn().mockResolvedValue([]),
  readDirectory: vi.fn().mockResolvedValue([]),
  setActiveProject: vi.fn().mockResolvedValue({ success: true }),
  scaffoldGenerate: vi.fn().mockResolvedValue({ success: true, output: '' }),
  updateBrowserUrl: vi.fn().mockResolvedValue({ success: true }),
  updateBrowserType: vi.fn().mockResolvedValue({ success: true }),
  updateBrowserOptions: vi.fn().mockResolvedValue({ success: true }),
  updateHeadlessMode: vi.fn().mockResolvedValue({ success: true }),
  getProjectConfig: vi.fn().mockResolvedValue({ success: true, config: {} }),
  isMobileProject: vi.fn().mockResolvedValue({ success: true, isMobileProject: false }),
  isQuickProject: vi.fn().mockResolvedValue(false),
  selectFolder: vi.fn().mockResolvedValue(null),
  saveQuickProjectTo: vi.fn(),
  getMobileCapabilities: vi.fn().mockResolvedValue({ success: true, capabilities: {} }),
  getRecorderSettings: vi.fn().mockResolvedValue({ implicitWait: 3, explicitWait: 15 }),
  updateRecordingSettings: vi.fn().mockResolvedValue({ success: true }),
  updateTimeout: vi.fn().mockResolvedValue({ success: true }),
  updateViewport: vi.fn().mockResolvedValue({ success: true }),
  updateMobileCapabilities: vi.fn().mockResolvedValue({ success: true }),
  startAppium: vi.fn().mockResolvedValue({ success: true }),
  updatePaths: vi.fn().mockResolvedValue({ success: true }),
  readFile: vi.fn().mockResolvedValue({ success: true, data: '' }),
  editFile: vi.fn().mockResolvedValue({ success: true }),
  deleteFile: vi.fn().mockResolvedValue({ success: true }),
  renameFile: vi.fn().mockResolvedValue({ success: true, newPath: '' }),
  duplicateFile: vi.fn().mockResolvedValue({ success: true, newPath: '' }),
  startRun: vi.fn().mockResolvedValue({ runId: 'r1' }),
  getRunDefaults: vi.fn().mockResolvedValue({ recommendedWorkers: 2, maxWorkers: 8 }),
  prepareSuiteRun: vi.fn().mockResolvedValue({ mode: 'legacy' })
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  useRunStore.setState({ run: null, origin: null, isActive: false })
  useRecorderStore.setState({ isRunning: false })
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
    await openFilesTab()

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
    await openFilesTab()

    expect(mockNavigate).toHaveBeenCalledWith('/start-project')
  })

  it('opens on the Tests tab first', async (): Promise<void> => {
    useProjectStore.setState({ projectPath: '/fake/project', files: [] })
    await act(async () => {
      render(
        <MemoryRouter>
          <Overview />
        </MemoryRouter>
      )
    })
    const tabs = screen.getAllByRole('button').map((b) => b.textContent)
    expect(tabs[0]).toBe('overview.tabs.tests')
    expect(screen.getByText('tests.empty')).toBeInTheDocument()
    expect(screen.queryByTestId('folder')).not.toBeInTheDocument()
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
    await openFilesTab()

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
    await openFilesTab()

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
    await openFilesTab()

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
    await openFilesTab()

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
    await openFilesTab()

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
    await openFilesTab()
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
    await openFilesTab()

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
    fireEvent.change(browserSelect, { target: { value: 'firefox' } })

    await waitFor(() => {
      expect(mockApi.updateBrowserType).toHaveBeenCalled()
    })
    // Browser should NOT be saved to localStorage on failure
    expect(localStorage.getItem('selectedBrowser')).toBeNull()
  })

  it('offers only Chrome and Firefox in the browser dropdown', async () => {
    await renderOverview()

    const select = screen.getByTestId('overview-browser-select')
    const options = select.querySelectorAll('option')
    expect(options).toHaveLength(2)
    expect(options[0]).toHaveValue('chrome')
    expect(options[1]).toHaveValue('firefox')
  })

  it('offers only All, Smoke and Regression run modes', async () => {
    await renderOverview()

    const select = screen.getByTestId('overview-run-mode-select')
    const values = Array.from(select.querySelectorAll('option')).map(
      (o) => (o as HTMLOptionElement).value
    )
    expect(values).toEqual(['all', 'smoke', 'regression'])
    expect(screen.queryByTestId('overview-custom-tag-input')).not.toBeInTheDocument()
  })

  it('reads the timeout and browser arguments back from the project config', async () => {
    mockApi.getProjectConfig.mockResolvedValueOnce({
      success: true,
      config: { timeout: 10, browser: 'chrome', browserArguments: ['no-sandbox'] }
    })
    await renderOverview()

    await waitFor(() => {
      expect(screen.getByLabelText('settings.timeout.label')).toHaveValue(10)
    })
    expect(screen.getByText('no-sandbox')).toBeInTheDocument()
  })

  it("shows the new browser's arguments after switching browsers", async () => {
    mockApi.getProjectConfig
      .mockResolvedValueOnce({
        success: true,
        config: { browser: 'chrome', browserArguments: ['no-sandbox'] }
      })
      .mockResolvedValueOnce({
        success: true,
        config: { browser: 'firefox', browserArguments: ['-private'] }
      })
    await renderOverview()
    await waitFor(() => expect(screen.getByText('no-sandbox')).toBeInTheDocument())

    fireEvent.change(screen.getByTestId('overview-browser-select'), {
      target: { value: 'firefox' }
    })

    await waitFor(() => expect(screen.getByText('-private')).toBeInTheDocument())
    expect(screen.queryByText('no-sandbox')).not.toBeInTheDocument()
  })

  it('shows a legacy saved browser as an extra option', async () => {
    mockApi.getProjectConfig.mockResolvedValueOnce({ success: true, config: { browser: 'safari' } })
    await renderOverview()

    const select = screen.getByTestId('overview-browser-select')
    await waitFor(() => expect(select).toHaveValue('safari'))
    expect(select.querySelectorAll('option')).toHaveLength(3)
  })

  it('does not allow a timeout edit before the config has loaded', async () => {
    mockApi.getProjectConfig.mockReturnValueOnce(new Promise(() => {}))
    await renderOverview()

    expect(screen.getByLabelText('settings.timeout.label')).toBeDisabled()
  })

  it('enables the timeout and browser args after a successful load', async () => {
    mockApi.getProjectConfig.mockResolvedValueOnce({ success: true, config: { timeout: 7 } })
    await renderOverview()

    await waitFor(() => expect(screen.getByLabelText('settings.timeout.label')).toBeEnabled())
    expect(screen.getByPlaceholderText('settings.browserOptions.placeholder')).toBeEnabled()
  })

  it('enables the timeout and browser args after a failed load and resets them', async () => {
    mockApi.getProjectConfig.mockRejectedValueOnce(new Error('boom'))
    await renderOverview()

    await waitFor(() => expect(screen.getByLabelText('settings.timeout.label')).toBeEnabled())
    expect(screen.getByPlaceholderText('settings.browserOptions.placeholder')).toBeEnabled()
    expect(screen.getByLabelText('settings.timeout.label')).toHaveValue(30)
  })

  it('ignores a stale browser-change re-fetch that resolves after a newer one', async () => {
    let resolveFirst: (v: unknown) => void = () => {}
    mockApi.getProjectConfig
      .mockResolvedValueOnce({ success: true, config: { browser: 'chrome', browserArguments: [] } })
      .mockImplementationOnce(() => new Promise((res) => (resolveFirst = res)))
      .mockResolvedValueOnce({
        success: true,
        config: { browser: 'chrome', browserArguments: ['latest-arg'] }
      })
    await renderOverview()
    const select = screen.getByTestId('overview-browser-select')

    fireEvent.change(select, { target: { value: 'firefox' } })
    await waitFor(() => expect(mockApi.getProjectConfig).toHaveBeenCalledTimes(2))
    fireEvent.change(select, { target: { value: 'chrome' } })
    await waitFor(() => expect(screen.getByText('latest-arg')).toBeInTheDocument())

    await act(async () => {
      resolveFirst({ success: true, config: { browserArguments: ['stale-arg'] } })
    })
    expect(screen.queryByText('stale-arg')).not.toBeInTheDocument()
    expect(screen.getByText('latest-arg')).toBeInTheDocument()
  })

  it('clears args and shows no update-failed toast when only the re-fetch fails', async () => {
    mockApi.getProjectConfig
      .mockResolvedValueOnce({
        success: true,
        config: { browser: 'chrome', browserArguments: ['no-sandbox'] }
      })
      .mockRejectedValueOnce(new Error('boom'))
    const errorSpy = vi.spyOn(toast, 'error')
    await renderOverview()
    await waitFor(() => expect(screen.getByText('no-sandbox')).toBeInTheDocument())

    fireEvent.change(screen.getByTestId('overview-browser-select'), {
      target: { value: 'firefox' }
    })

    await waitFor(() => expect(screen.queryByText('no-sandbox')).not.toBeInTheDocument())
    expect(errorSpy).not.toHaveBeenCalled()
  })

  describe('quick-record banner', (): void => {
    beforeEach(() => {
      mockApi.isQuickProject.mockResolvedValue(false)
      useRecorderStore.getState().resetForProject()
    })

    const renderOverview = async (): Promise<void> => {
      useProjectStore.setState({ projectPath: '/quick/project', files: [] })
      await act(async () => {
        render(
          <MemoryRouter>
            <Overview />
          </MemoryRouter>
        )
      })
    }

    it('is hidden for a regular project', async (): Promise<void> => {
      await renderOverview()
      expect(screen.queryByText('quickRecord.banner')).not.toBeInTheDocument()
    })

    it('shows for a quick project and re-activates the moved project after saving', async (): Promise<void> => {
      mockApi.isQuickProject.mockResolvedValue(true)
      mockApi.selectFolder.mockResolvedValue('/dest')
      mockApi.saveQuickProjectTo.mockResolvedValue({ success: true, projectPath: '/dest/proj' })
      await renderOverview()
      expect(screen.getByText('quickRecord.banner')).toBeInTheDocument()
      await act(async () => {
        fireEvent.click(screen.getByText('quickRecord.saveTo'))
      })
      expect(mockApi.saveQuickProjectTo).toHaveBeenCalledWith('/quick/project', '/dest')
      expect(useProjectStore.getState().projectPath).toBe('/dest/proj')
    })

    it('is disabled while recording and while a draft exists', async (): Promise<void> => {
      mockApi.isQuickProject.mockResolvedValue(true)
      await renderOverview()
      const button = screen.getByText('quickRecord.saveTo')
      expect(button).toBeEnabled()
      act(() => useRecorderStore.setState({ isRecording: true }))
      expect(button).toBeDisabled()
      act(() => useRecorderStore.setState({ isRecording: false }))
      expect(button).toBeEnabled()
      act(() => useRecorderStore.getState().startDraft('t', 'https://e.com'))
      // Nothing recorded yet: an empty draft is never saved, so there is nothing to lose
      expect(button).toBeEnabled()
      act(() =>
        useRecorderStore.getState().updateActiveTest((p) =>
          p ? { ...p, steps: [{ id: 'c', kind: 'custom', code: 'x' }] } : null
        )
      )
      expect(button).toBeDisabled()
      expect(button).toHaveAttribute('title', 'quickRecord.stopFirst')
    })

    it('ignores a second click while a save is in flight', async (): Promise<void> => {
      mockApi.isQuickProject.mockResolvedValue(true)
      mockApi.selectFolder.mockResolvedValue('/dest')
      let finish: (v: unknown) => void = () => {}
      mockApi.saveQuickProjectTo.mockReturnValue(new Promise((r) => (finish = r)))
      await renderOverview()
      const button = screen.getByText('quickRecord.saveTo')
      await act(async () => {
        fireEvent.click(button)
      })
      await act(async () => {
        fireEvent.click(button)
      })
      expect(mockApi.saveQuickProjectTo).toHaveBeenCalledTimes(1)
      await act(async () => finish({ success: true, projectPath: '/dest/proj' }))
    })

    it('does nothing when the folder pick is cancelled', async (): Promise<void> => {
      mockApi.isQuickProject.mockResolvedValue(true)
      mockApi.selectFolder.mockResolvedValue(null)
      await renderOverview()
      await act(async () => {
        fireEvent.click(screen.getByText('quickRecord.saveTo'))
      })
      expect(mockApi.saveQuickProjectTo).not.toHaveBeenCalled()
      expect(useProjectStore.getState().projectPath).toBe('/quick/project')
    })
  })
})

describe('Overview wait settings', (): void => {
  const renderFiles = async (): Promise<void> => {
    useProjectStore.setState({ projectPath: '/fake/project', files: [] })
    await act(async () => {
      render(
        <MemoryRouter>
          <Overview />
        </MemoryRouter>
      )
    })
    await openFilesTab()
  }

  it('shows the implicit and explicit wait fields with the project values', async (): Promise<void> => {
    await renderFiles()
    expect(screen.getByLabelText('settings.recording.implicitWait.label')).toHaveValue(3)
    expect(screen.getByLabelText('settings.recording.explicitWait.label')).toHaveValue(15)
  })

  it('saves a wait on blur once the settings have loaded', async (): Promise<void> => {
    await renderFiles()
    const input = screen.getByLabelText('settings.recording.implicitWait.label')
    fireEvent.change(input, { target: { value: '7' } })
    await act(async () => {
      fireEvent.blur(input)
    })
    expect(mockApi.updateRecordingSettings).toHaveBeenCalledWith({ implicitWait: 7 })

    const explicit = screen.getByLabelText('settings.recording.explicitWait.label')
    fireEvent.change(explicit, { target: { value: '20' } })
    await act(async () => {
      fireEvent.blur(explicit)
    })
    expect(mockApi.updateRecordingSettings).toHaveBeenCalledWith({ explicitWait: 20 })
  })

  it('does not save before the settings have loaded', async (): Promise<void> => {
    mockApi.getRecorderSettings.mockReturnValueOnce(new Promise(() => {}))
    await renderFiles()
    const input = screen.getByLabelText('settings.recording.implicitWait.label')
    await act(async () => {
      fireEvent.blur(input)
    })
    expect(mockApi.updateRecordingSettings).not.toHaveBeenCalled()
  })
})

describe('Overview live runs', (): void => {
  const renderOverview = async (): Promise<void> => {
    useProjectStore.setState({ projectPath: '/fake/project', files: [] })
    await act(async () => {
      render(
        <MemoryRouter>
          <Overview />
        </MemoryRouter>
      )
    })
    await openFilesTab()
  }

  const failedRun = (): RunView => ({
    runId: 'r0',
    projectPath: '/fake/project',
    scope: { kind: 'all' },
    framework: 'rspec',
    workers: 1,
    liveEvents: true,
    startedAt: '2026-01-01T00:00:00Z',
    phase: 'running',
    tests: {
      t1: {
        id: 't1',
        file: 'spec/login_spec.rb',
        line: 12,
        description: 'logs in',
        fullName: 'Login logs in',
        state: 'failed'
      }
    },
    order: ['t1'],
    output: [],
    finished: {
      status: 'failed',
      counts: { total: 1, passed: 0, failed: 1, pending: 0, skipped: 0, quarantined: 0 },
      exitCode: 1,
      finishedAt: '2026-01-01T00:01:00Z'
    }
  })

  const scopeSent = (): unknown => mockApi.startRun.mock.calls[0][0].scope

  it('starts a live run of every test from Run Tests', async () => {
    await renderOverview()
    await act(async () => {
      fireEvent.click(screen.getByTestId('run-tests'))
    })
    expect(mockApi.startRun).toHaveBeenCalledTimes(1)
    expect(scopeSent()).toEqual({ kind: 'all' })
    expect(useRunStore.getState().origin).toEqual({
      route: '/overview',
      label: 'run.originProject'
    })
  })

  it('runs the smoke tag when the run mode is Smoke', async () => {
    await renderOverview()
    fireEvent.change(screen.getByTestId('overview-run-mode-select'), {
      target: { value: 'smoke' }
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('run-tests'))
    })
    expect(scopeSent()).toEqual({ kind: 'tags', tags: ['smoke'] })
  })

  it('sends the recommended workers when Run in parallel is on', async () => {
    await renderOverview()
    await act(async () => {
      fireEvent.click(screen.getByTestId('overview-parallel-toggle'))
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('run-tests'))
    })
    expect(mockApi.startRun.mock.calls[0][0].workers).toBe(2)
  })

  it('keeps the parallel choice and workers in More options', async () => {
    await renderOverview()
    await act(async () => {
      fireEvent.click(screen.getByTestId('overview-parallel-toggle'))
    })
    fireEvent.click(screen.getByTestId('overview-more-options'))
    const workers = screen.getByTestId('overview-workers-input')
    expect(workers).toHaveAttribute('max', '8')
    expect(workers).toHaveAttribute('placeholder', '2')
    fireEvent.change(workers, { target: { value: '3' } })
    fireEvent.click(screen.getByTestId('overview-quarantined-fails-toggle'))
    expect(JSON.parse(localStorage.getItem('raider.runSettings:/fake/project') as string)).toEqual({
      parallel: true,
      workers: 3,
      quarantinedFails: true
    })
  })

  it('re-runs the failed tests of the last run by location', async () => {
    useRunStore.setState({ run: failedRun(), origin: null, isActive: false })
    await renderOverview()
    const rerun = screen.getByTestId('overview-rerun-failed-btn')
    expect(rerun).toBeEnabled()
    await act(async () => {
      fireEvent.click(rerun)
    })
    expect(scopeSent()).toEqual({ kind: 'locations', locations: ['spec/login_spec.rb:12'] })
  })

  it('re-runs the last results after a cancelled run that recorded no failures', async () => {
    const cancelled = failedRun()
    useRunStore.setState({
      run: {
        ...cancelled,
        tests: {},
        order: [],
        finished: {
          ...cancelled.finished!,
          status: 'cancelled',
          counts: { ...cancelled.finished!.counts, total: 0, failed: 0 }
        }
      },
      origin: null,
      isActive: false
    })
    mockApi.readDirectory.mockImplementation(async (dir: string) =>
      dir === '/fake/project/raider-results'
        ? [{ name: 'run.json', type: 'file', path: '/fake/project/raider-results/run.json' }]
        : []
    )
    mockApi.readFile.mockImplementation(async (path: string) =>
      path === '/fake/project/raider-results/run.json'
        ? {
            success: true,
            data: JSON.stringify({
              results: [
                {
                  full_name: 'Cart: adds',
                  status: 'failed',
                  file_path: './spec/cart_spec.rb',
                  line_number: 7,
                  attachments: []
                }
              ]
            })
          }
        : { success: true, data: '' }
    )
    try {
      await renderOverview()
      const rerun = screen.getByTestId('overview-rerun-failed-btn')
      await waitFor(() => expect(rerun).toBeEnabled())
      await act(async () => {
        fireEvent.click(rerun)
      })
      expect(scopeSent()).toEqual({ kind: 'locations', locations: ['spec/cart_spec.rb:7'] })
    } finally {
      mockApi.readDirectory.mockResolvedValue([])
      mockApi.readFile.mockResolvedValue({ success: true, data: '' })
    }
  })

  it('disables Re-run failed when nothing failed', async () => {
    await renderOverview()
    const rerun = screen.getByTestId('overview-rerun-failed-btn')
    expect(rerun).toBeDisabled()
    expect(rerun).toHaveAttribute('title', 'run.nothingFailed')
  })

  it('disables the run buttons while a run is active', async () => {
    useRunStore.setState({
      run: { ...failedRun(), finished: null },
      origin: { route: '/overview', label: 'run.originProject' },
      isActive: true
    })
    await renderOverview()
    expect(screen.getByTestId('run-tests')).toBeDisabled()
    expect(screen.getByTestId('overview-rerun-failed-btn')).toBeDisabled()
  })

  it('disables the run buttons while the recorder is running a test', async () => {
    useRunStore.setState({ run: failedRun(), origin: null, isActive: false })
    useRecorderStore.setState({ isRunning: true })
    await renderOverview()
    expect(screen.getByTestId('run-tests')).toBeDisabled()
    expect(screen.getByTestId('overview-rerun-failed-btn')).toBeDisabled()
  })

  it('shows the run panel above every tab', async () => {
    useRunStore.setState({
      run: { ...failedRun(), finished: null },
      origin: { route: '/overview', label: 'run.originProject' },
      isActive: true
    })
    useProjectStore.setState({ projectPath: '/fake/project', files: [] })
    await act(async () => {
      render(
        <MemoryRouter>
          <Overview />
        </MemoryRouter>
      )
    })
    expect(screen.getByTestId('run-panel')).toBeInTheDocument()
    fireEvent.click(screen.getByText('overview.tabs.dashboard'))
    expect(screen.getByTestId('run-panel')).toBeInTheDocument()
  })

  it("shows a suite run started on the Tests tab in Overview's panel", async () => {
    mockApi.getSuites.mockResolvedValue([{ id: 's1', name: 'Smoke', tests: [] }])
    mockApi.prepareSuiteRun.mockResolvedValue({
      mode: 'files',
      files: ['spec/login_spec.rb'],
      skipped: []
    })
    try {
      useProjectStore.setState({ projectPath: '/fake/project', files: [] })
      await act(async () => {
        render(
          <MemoryRouter initialEntries={['/overview']}>
            <Overview />
          </MemoryRouter>
        )
      })
      const select = await screen.findByLabelText('tests.suiteFilter.label')
      await waitFor(() => expect(select.querySelectorAll('option')).toHaveLength(2))
      fireEvent.change(select, { target: { value: 's1' } })
      fireEvent.click(screen.getByRole('button', { name: 'tests.suiteFilter.actions' }))
      await act(async () => {
        fireEvent.click(screen.getByRole('menuitem', { name: 'tests.suiteFilter.run' }))
      })
      await waitFor(() => expect(mockApi.startRun).toHaveBeenCalledTimes(1))
      expect(useRunStore.getState().origin).toEqual({ route: '/overview', label: 'Smoke' })
      // Main reports the run started
      act(() =>
        useRunStore.setState({
          run: { ...failedRun(), scope: { kind: 'files', files: ['spec/login_spec.rb'] } },
          isActive: false
        })
      )
      expect(screen.getByTestId('run-panel')).toBeInTheDocument()
    } finally {
      mockApi.getSuites.mockResolvedValue([])
      mockApi.prepareSuiteRun.mockResolvedValue({ mode: 'legacy' })
    }
  })
})
