import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import type React from 'react'
import Overview from '@pages/Overview'
import { dispatchMenuCommand } from '@foundation/menuCommands'
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
    runDisabled,
    onFileClick
  }: {
    name: string | undefined
    onRunTests?: () => void
    runDisabled?: boolean
    onFileClick?: (path: string) => void
  }): JSX.Element => (
    <div data-testid="folder">
      {name}
      {onRunTests && <button data-testid="run-tests" onClick={onRunTests} disabled={runDisabled} />}
      {/* Two files to click, for the inline editor */}
      <button onClick={() => onFileClick?.('/fake/project/spec/a_spec.rb')}>a_spec.rb</button>
      <button onClick={() => onFileClick?.('/fake/project/spec/b_spec.rb')}>b_spec.rb</button>
    </div>
  )
}))

vi.mock('@components/ScaffoldPanel', () => ({
  default: (): JSX.Element => <div data-testid="scaffold-panel">ScaffoldPanel</div>
}))

vi.mock('@components/ProjectDashboard', () => ({
  default: (): JSX.Element => <div data-testid="project-dashboard">ProjectDashboard</div>
}))

// A stand-in by default; the real component where its async load matters
const realDeviceSettings = vi.hoisted(() => ({ on: false }))
vi.mock('@components/DeviceSettings', async () => {
  const { default: Real } = await vi.importActual<typeof import('@components/DeviceSettings')>(
    '@components/DeviceSettings'
  )
  return {
    default: (
      props: React.ComponentProps<typeof Real> & { focusRef?: React.Ref<HTMLInputElement> }
    ): JSX.Element =>
      realDeviceSettings.on ? (
        <Real {...props} />
      ) : (
        <div data-testid="device-settings">
          {props.projectPath}
          <input aria-label="device-app" ref={props.focusRef} />
        </div>
      )
  }
})

vi.mock('@components/Editor', () => ({
  default: ({
    value,
    onChange
  }: {
    value: string
    onChange?: (value: string) => void
  }): JSX.Element => (
    <textarea
      data-testid="editor"
      defaultValue={value}
      onChange={(e) => onChange?.(e.target.value)}
    />
  )
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
  isQuickProject: vi.fn().mockResolvedValue(false),
  selectFolder: vi.fn().mockResolvedValue(null),
  saveQuickProjectTo: vi.fn(),
  getRecorderSettings: vi.fn().mockResolvedValue({ implicitWait: 3, explicitWait: 15 }),
  updateRecordingSettings: vi.fn().mockResolvedValue({ success: true }),
  updateTimeout: vi.fn().mockResolvedValue({ success: true }),
  updateViewport: vi.fn().mockResolvedValue({ success: true }),
  updatePaths: vi.fn().mockResolvedValue({ success: true }),
  readFile: vi.fn().mockResolvedValue({ success: true, data: '' }),
  editFile: vi.fn().mockResolvedValue({ success: true }),
  deleteFile: vi.fn().mockResolvedValue({ success: true }),
  renameFile: vi.fn().mockResolvedValue({ success: true, newPath: '' }),
  duplicateFile: vi.fn().mockResolvedValue({ success: true, newPath: '' }),
  startRun: vi.fn().mockResolvedValue({ runId: 'r1' }),
  getRunDefaults: vi.fn().mockResolvedValue({ recommendedWorkers: 2, maxWorkers: 8 }),
  prepareSuiteRun: vi.fn().mockResolvedValue({ mode: 'legacy' }),
  checkMobileReady: vi.fn().mockResolvedValue({ ok: true }),
  getDeviceSettings: vi.fn(),
  onSuiteUpdated: vi.fn(() => vi.fn())
}

// Web controls only show once the layout says the project isn't mobile
const webLayout = {
  framework: 'rspec',
  automation: 'selenium',
  specPath: 'spec',
  featurePath: 'features',
  helperPath: 'helpers',
  waitHelper: false,
  recordable: true
} as const

beforeEach(async () => {
  vi.clearAllMocks()
  localStorage.clear()
  // @ts-expect-error - Mocking window.api
  window.api = mockApi
  // A project switch clears the layout and re-activates, so settle that before setting one
  useProjectStore.setState({ projectPath: '/fake/project', files: [] })
  await act(async () => {})
  useProjectStore.setState({ layout: webLayout })
  useRunStore.setState({
    run: null,
    origin: null,
    isActive: false,
    freshLoginNext: false,
    notReady: null,
    deviceFocusRequested: false,
    checking: false
  })
  useRecorderStore.setState({ isRunning: false })
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

  it('shows a tooltip on each tab on focus', async (): Promise<void> => {
    useProjectStore.setState({ projectPath: '/fake/project', files: [] })
    await act(async () => {
      render(
        <MemoryRouter>
          <Overview />
        </MemoryRouter>
      )
    })
    const tabs: [string, string][] = [
      ['overview.tabs.tests', 'tooltips.overview.tabTests'],
      ['overview.tabs.files', 'tooltips.overview.tabFiles'],
      ['Scaffolding', 'tooltips.overview.tabScaffold'],
      ['overview.tabs.dashboard', 'tooltips.overview.tabDashboard']
    ]
    for (const [name, key] of tabs) {
      const tab = screen.getByRole('button', { name })
      fireEvent.focus(tab)
      expect(screen.getByRole('tooltip')).toHaveTextContent(key)
      fireEvent.blur(tab)
    }
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

  const appiumLayout = {
    framework: 'rspec',
    automation: 'appium',
    mobilePlatform: 'ios',
    specPath: 'spec',
    featurePath: 'features',
    helperPath: 'helpers',
    waitHelper: false,
    recordable: false,
    unsupportedReason: 'mobile'
  } as const

  it('shows the Device section in place of the web settings for a mobile project', async () => {
    useProjectStore.setState({ layout: appiumLayout })
    await renderOverview()

    expect(screen.getByTestId('device-settings')).toHaveTextContent('/fake/project')
    expect(screen.queryByTestId('overview-url-input')).not.toBeInTheDocument()
    expect(screen.queryByTestId('overview-browser-select')).not.toBeInTheDocument()
    expect(screen.queryByTestId('overview-headless-toggle')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('settings.timeout.label')).not.toBeInTheDocument()
    expect(screen.queryByText('settings.section.browserOptions')).not.toBeInTheDocument()
    // Run controls stay
    expect(screen.getByTestId('overview-run-mode-select')).toBeInTheDocument()
  })

  it('has no parallel or workers controls for a mobile project', async () => {
    useProjectStore.setState({ layout: appiumLayout })
    await renderOverview()

    expect(screen.queryByTestId('overview-parallel-toggle')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('overview-more-options'))
    expect(screen.getByTestId('overview-more-options-panel')).toBeInTheDocument()
    expect(screen.queryByTestId('overview-workers-input')).not.toBeInTheDocument()
  })

  it('has no browser login or recorder wait controls for a mobile project', async () => {
    useProjectStore.setState({ layout: appiumLayout })
    await renderOverview()

    fireEvent.click(screen.getByTestId('overview-more-options'))
    expect(screen.getByTestId('overview-quarantined-fails-toggle')).toBeInTheDocument()
    expect(screen.queryByTestId('overview-reuse-logins')).not.toBeInTheDocument()
    expect(screen.queryByTestId('overview-fresh-login')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('settings.recording.implicitWait.label')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('settings.recording.explicitWait.label')).not.toBeInTheDocument()
  })

  it('keeps the browser login and recorder wait controls for a web project', async () => {
    useProjectStore.setState({
      layout: { ...appiumLayout, automation: 'selenium', recordable: true }
    })
    await renderOverview()

    fireEvent.click(screen.getByTestId('overview-more-options'))
    expect(screen.getByTestId('overview-reuse-logins')).toBeInTheDocument()
    expect(screen.getByTestId('overview-fresh-login')).toBeInTheDocument()
    expect(screen.getByLabelText('settings.recording.implicitWait.label')).toBeInTheDocument()
    expect(screen.getByLabelText('settings.recording.explicitWait.label')).toBeInTheDocument()
  })

  it('opens the Files tab and focuses the app file when device settings are asked for', async () => {
    useProjectStore.setState({ layout: appiumLayout, projectPath: '/fake/project', files: [] })
    await act(async () => {
      render(
        <MemoryRouter>
          <Overview />
        </MemoryRouter>
      )
    })
    expect(screen.queryByTestId('device-settings')).not.toBeInTheDocument()

    await act(async () => {
      useRunStore.getState().requestDeviceFocus()
    })
    expect(await screen.findByLabelText('device-app')).toHaveFocus()
    expect(useRunStore.getState().deviceFocusRequested).toBe(false)
  })

  it('focuses the real app file field once its settings load', async () => {
    let loaded: (v: unknown) => void = () => {}
    mockApi.getDeviceSettings.mockReturnValueOnce(new Promise((resolve) => (loaded = resolve)))
    realDeviceSettings.on = true
    try {
      useProjectStore.setState({ layout: appiumLayout, projectPath: '/fake/project', files: [] })
      await act(async () => {
        render(
          <MemoryRouter>
            <Overview />
          </MemoryRouter>
        )
      })
      await act(async () => {
        useRunStore.getState().requestDeviceFocus()
      })
      // The tab is open but the field isn't there yet, so the request waits
      expect(screen.getByTestId('device-settings')).toBeInTheDocument()
      expect(screen.queryByTestId('device-ios-app')).not.toBeInTheDocument()
      expect(useRunStore.getState().deviceFocusRequested).toBe(true)

      await act(async () => {
        loaded({
          platform: 'ios',
          ios: {
            deviceName: 'iPhone 15',
            platformVersion: '17.0',
            app: '/apps/Shop.app',
            automationName: 'XCUITest'
          }
        })
      })
      expect(await screen.findByTestId('device-ios-app')).toHaveFocus()
      expect(useRunStore.getState().deviceFocusRequested).toBe(false)
    } finally {
      realDeviceSettings.on = false
    }
  })

  it('focuses the app file when the Files tab is already open', async () => {
    useProjectStore.setState({ layout: appiumLayout })
    await renderOverview()
    expect(screen.getByLabelText('device-app')).not.toHaveFocus()

    await act(async () => {
      useRunStore.getState().requestDeviceFocus()
    })
    expect(screen.getByLabelText('device-app')).toHaveFocus()
    expect(useRunStore.getState().deviceFocusRequested).toBe(false)
  })

  it('does not fall back to stored browser settings for a mobile project', async () => {
    localStorage.setItem('browserUrl', 'https://stored-url.com')
    mockApi.getProjectConfig.mockResolvedValueOnce({
      success: true,
      config: { baseUrl: 'https://from-config.com', browser: 'firefox', headless: true }
    })
    useProjectStore.setState({ layout: appiumLayout })
    await renderOverview()

    expect(localStorage.getItem('browserUrl')).toBe('https://stored-url.com')
    expect(localStorage.getItem('selectedBrowser')).toBeNull()
    expect(localStorage.getItem('headless')).toBeNull()
  })

  it('keeps the web settings and no Device section for a selenium project', async () => {
    useProjectStore.setState({ layout: webLayout })
    await renderOverview()

    expect(screen.queryByTestId('device-settings')).not.toBeInTheDocument()
    expect(screen.getByTestId('overview-url-input')).toBeInTheDocument()
    expect(screen.getByTestId('overview-browser-select')).toBeInTheDocument()
    expect(screen.getByTestId('overview-headless-toggle')).toBeInTheDocument()
    expect(screen.getByLabelText('settings.timeout.label')).toBeInTheDocument()
    expect(screen.getByText('settings.section.browserOptions')).toBeInTheDocument()
  })

  it('shows neither the web settings nor the Device section until the layout is known', async () => {
    useProjectStore.setState({ layout: null })
    await renderOverview()

    expect(screen.queryByTestId('overview-url-input')).not.toBeInTheDocument()
    expect(screen.queryByTestId('overview-browser-select')).not.toBeInTheDocument()
    expect(screen.queryByTestId('overview-headless-toggle')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('settings.timeout.label')).not.toBeInTheDocument()
    expect(screen.queryByTestId('device-settings')).not.toBeInTheDocument()
  })

  it('discards a web config load that lands after the layout says mobile', async () => {
    let resolveConfig: (value: unknown) => void = () => {}
    mockApi.getProjectConfig.mockImplementationOnce(
      () => new Promise((resolve) => (resolveConfig = resolve))
    )
    useProjectStore.setState({ layout: null })
    await renderOverview()

    await act(async () => {
      useProjectStore.setState({ layout: appiumLayout })
    })
    await act(async () => {
      resolveConfig({
        success: true,
        config: { baseUrl: 'https://late.com', browser: 'firefox', headless: true }
      })
    })

    expect(localStorage.getItem('browserUrl')).toBeNull()
    expect(localStorage.getItem('selectedBrowser')).toBeNull()
    expect(localStorage.getItem('headless')).toBeNull()
    expect(screen.getByTestId('device-settings')).toBeInTheDocument()
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
        useRecorderStore
          .getState()
          .updateActiveTest((p) =>
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
    outputSize: 0,
    outputTrimmed: false,
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

  it('keeps Run Tests and Re-run failed off while a mobile check is running', async () => {
    await renderOverview()
    act(() => useRunStore.setState({ checking: true }))
    expect(screen.getByTestId('run-tests')).toBeDisabled()
    expect(screen.getByTestId('overview-rerun-failed-btn')).toBeDisabled()
    act(() => useRunStore.setState({ checking: false }))
    expect(screen.getByTestId('run-tests')).toBeEnabled()
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
      quarantinedFails: true,
      reuseLogins: true
    })
  })

  it('persists the reuse logins toggle and disables fresh login while off', async () => {
    await renderOverview()
    fireEvent.click(screen.getByTestId('overview-more-options'))
    expect(screen.getByTestId('overview-fresh-login')).toBeEnabled()
    fireEvent.click(screen.getByTestId('overview-reuse-logins'))
    expect(
      JSON.parse(localStorage.getItem('raider.runSettings:/fake/project') as string).reuseLogins
    ).toBe(false)
    expect(screen.getByTestId('overview-fresh-login')).toBeDisabled()
  })

  it('Run in parallel has a tooltip', async () => {
    await renderOverview()
    fireEvent.focus(screen.getByTestId('overview-parallel-toggle'))
    expect(screen.getByRole('tooltip')).toHaveTextContent('tooltips.files.parallel')
  })

  it('sends loginState refresh when fresh login is checked', async () => {
    await renderOverview()
    fireEvent.click(screen.getByTestId('overview-more-options'))
    fireEvent.click(screen.getByTestId('overview-fresh-login'))
    await act(async () => {
      fireEvent.click(screen.getByTestId('run-tests'))
    })
    expect(mockApi.startRun.mock.calls[0][0].loginState).toBe('refresh')
  })

  it('re-runs the failed tests of the last run by location', async () => {
    useRunStore.setState({ run: failedRun(), origin: null, isActive: false })
    await renderOverview()
    const rerun = screen.getByTestId('overview-rerun-failed-btn')
    expect(rerun).toBeEnabled()
    expect(rerun).toHaveAttribute('title', 'run.rerunSerial')
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

  describe('inline editor saving (D3)', () => {
    const renderFiles = async (): Promise<void> => {
      mockApi.readFile.mockResolvedValue({ success: true, data: 'original' })
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
    const openFile = async (name: string): Promise<void> => {
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name }))
      })
    }
    const type = (text: string): void => {
      fireEvent.change(screen.getByTestId('editor'), { target: { value: text } })
    }
    const saveButton = (): HTMLElement => screen.getByRole('button', { name: 'editor.saveButton' })

    it('has a Save button that wakes up once the file is edited', async () => {
      await renderFiles()
      await openFile('a_spec.rb')
      expect(saveButton()).toBeDisabled()
      type('changed')
      expect(saveButton()).toBeEnabled()
      expect(screen.getByText('editor.status.unsaved')).toBeInTheDocument()
      await act(async () => {
        fireEvent.click(saveButton())
      })
      expect(mockApi.editFile).toHaveBeenCalledWith('/fake/project/spec/a_spec.rb', 'changed')
      await waitFor(() => expect(saveButton()).toBeDisabled())
    })

    it('asks before opening another file over unsaved changes; Cancel keeps the edit', async () => {
      await renderFiles()
      await openFile('a_spec.rb')
      type('changed')
      await openFile('b_spec.rb')
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'editor.unsaved.cancel' }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(mockApi.readFile).toHaveBeenCalledTimes(1)
      expect(screen.getByTestId('editor')).toHaveValue('changed')
    })

    it("Don't save opens the other file without writing", async () => {
      await renderFiles()
      await openFile('a_spec.rb')
      type('changed')
      await openFile('b_spec.rb')
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'editor.unsaved.discard' }))
      })
      expect(mockApi.editFile).not.toHaveBeenCalled()
      expect(mockApi.readFile).toHaveBeenLastCalledWith('/fake/project/spec/b_spec.rb')
    })

    it('Save writes the first file and then opens the other', async () => {
      await renderFiles()
      await openFile('a_spec.rb')
      type('changed')
      await openFile('b_spec.rb')
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'editor.unsaved.save' }))
      })
      expect(mockApi.editFile).toHaveBeenCalledWith('/fake/project/spec/a_spec.rb', 'changed')
      await waitFor(() =>
        expect(mockApi.readFile).toHaveBeenLastCalledWith('/fake/project/spec/b_spec.rb')
      )
    })

    it('asks before switching tabs over unsaved changes; Cancel stays with the edit (R1)', async () => {
      await renderFiles()
      await openFile('a_spec.rb')
      type('changed')
      await act(async () => {
        fireEvent.click(screen.getByText('overview.tabs.tests'))
      })
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'editor.unsaved.cancel' }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByTestId('editor')).toHaveValue('changed')
      expect(screen.getByText('editor.status.unsaved')).toBeInTheDocument()
    })

    it("Don't save switches tabs and drops the edit", async () => {
      await renderFiles()
      await openFile('a_spec.rb')
      type('changed')
      await act(async () => {
        fireEvent.click(screen.getByText('overview.tabs.dashboard'))
      })
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'editor.unsaved.discard' }))
      })
      expect(mockApi.editFile).not.toHaveBeenCalled()
      expect(screen.queryByTestId('editor')).not.toBeInTheDocument()
      await openFilesTab()
      expect(screen.getByTestId('editor')).toHaveValue('original')
      expect(screen.queryByText('editor.status.unsaved')).not.toBeInTheDocument()
    })

    it('Save writes the file and then switches tabs', async () => {
      await renderFiles()
      await openFile('a_spec.rb')
      type('changed')
      await act(async () => {
        fireEvent.click(screen.getByText('overview.tabs.dashboard'))
      })
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'editor.unsaved.save' }))
      })
      expect(mockApi.editFile).toHaveBeenCalledWith('/fake/project/spec/a_spec.rb', 'changed')
      await waitFor(() => expect(screen.queryByTestId('editor')).not.toBeInTheDocument())
    })

    it('clicking the Files tab again with an unsaved edit does not ask', async () => {
      await renderFiles()
      await openFile('a_spec.rb')
      type('changed')
      await openFilesTab()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByTestId('editor')).toHaveValue('changed')
    })

    it('switches tabs at once when the file is saved', async () => {
      await renderFiles()
      await openFile('a_spec.rb')
      await act(async () => {
        fireEvent.click(screen.getByText('overview.tabs.dashboard'))
      })
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.queryByTestId('editor')).not.toBeInTheDocument()
    })

    it('keeps the dialog up until the save before leaving has finished', async () => {
      let finish: (v: { success: boolean }) => void = () => {}
      mockApi.editFile.mockReturnValue(new Promise((r) => (finish = r)))
      await renderFiles()
      await openFile('a_spec.rb')
      type('changed')
      await openFile('b_spec.rb')
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'editor.unsaved.save' }))
      })
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(mockApi.readFile).toHaveBeenCalledTimes(1)
      await act(async () => finish({ success: true }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      await waitFor(() =>
        expect(mockApi.readFile).toHaveBeenLastCalledWith('/fake/project/spec/b_spec.rb')
      )
    })

    it('ignores Cmd+S while another tab is showing', async () => {
      await renderFiles()
      await openFile('a_spec.rb')
      type('changed')
      await act(async () => {
        fireEvent.click(screen.getByText('overview.tabs.tests'))
      })
      // The tab switch asks first (R1); leaving without saving lands on the Tests tab
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'editor.unsaved.discard' }))
      })
      fireEvent.keyDown(window, { key: 's', metaKey: true })
      expect(mockApi.editFile).not.toHaveBeenCalled()
    })
  })

  describe('settings feedback (D6)', () => {
    it('rejects a base URL that is not a web address, inline, without saving', async () => {
      await renderOverview()
      const urlInput = screen.getByTestId('overview-url-input')
      fireEvent.change(urlInput, { target: { value: 'not a url' } })
      fireEvent.blur(urlInput)
      expect(screen.getByRole('alert')).toHaveTextContent('overview.settings.urlInvalid')
      expect(urlInput).toHaveAttribute('aria-invalid', 'true')
      expect(mockApi.updateBrowserUrl).not.toHaveBeenCalled()
      expect(localStorage.getItem('browserUrl')).toBeNull()
    })

    it('rejects an address without http or https', async () => {
      await renderOverview()
      const urlInput = screen.getByTestId('overview-url-input')
      fireEvent.change(urlInput, { target: { value: 'ftp://files.test' } })
      fireEvent.keyDown(urlInput, { key: 'Enter' })
      expect(screen.getByRole('alert')).toHaveTextContent('overview.settings.urlInvalid')
      expect(mockApi.updateBrowserUrl).not.toHaveBeenCalled()
    })

    it('says Saved next to the settings instead of a toast once the URL is written', async () => {
      await renderOverview()
      const urlInput = screen.getByTestId('overview-url-input')
      fireEvent.change(urlInput, { target: { value: 'https://ok.test' } })
      fireEvent.blur(urlInput)
      await waitFor(() => expect(mockApi.updateBrowserUrl).toHaveBeenCalled())
      expect(await screen.findByRole('status')).toHaveTextContent('overview.settings.saved')
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('clears the error once a good address is saved', async () => {
      await renderOverview()
      const urlInput = screen.getByTestId('overview-url-input')
      fireEvent.change(urlInput, { target: { value: 'nope' } })
      fireEvent.blur(urlInput)
      expect(screen.getByRole('alert')).toBeInTheDocument()
      fireEvent.change(urlInput, { target: { value: 'https://ok.test' } })
      fireEvent.blur(urlInput)
      await waitFor(() => expect(mockApi.updateBrowserUrl).toHaveBeenCalled())
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('does not write the address again when nothing changed', async () => {
      localStorage.setItem('browserUrl', 'https://same.test')
      await renderOverview()
      const urlInput = screen.getByTestId('overview-url-input')
      expect(urlInput).toHaveValue('https://same.test')
      fireEvent.blur(urlInput)
      fireEvent.keyDown(urlInput, { key: 'Enter' })
      await act(async () => {})
      expect(mockApi.updateBrowserUrl).not.toHaveBeenCalled()
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })

    it('trims the address before writing it', async () => {
      await renderOverview()
      const urlInput = screen.getByTestId('overview-url-input')
      fireEvent.change(urlInput, { target: { value: '  https://ok.test ' } })
      fireEvent.blur(urlInput)
      await waitFor(() =>
        expect(mockApi.updateBrowserUrl).toHaveBeenCalledWith('/fake/project', 'https://ok.test')
      )
      expect(localStorage.getItem('browserUrl')).toBe('https://ok.test')
    })

    it('drops the error as soon as the field changes', async () => {
      await renderOverview()
      const urlInput = screen.getByTestId('overview-url-input')
      fireEvent.change(urlInput, { target: { value: 'nope' } })
      fireEvent.blur(urlInput)
      expect(screen.getByRole('alert')).toBeInTheDocument()
      fireEvent.change(urlInput, { target: { value: '' } })
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      fireEvent.blur(urlInput)
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('says Saved after the headless switch is written', async () => {
      await renderOverview()
      fireEvent.click(screen.getByTestId('overview-headless-toggle'))
      await waitFor(() => expect(mockApi.updateHeadlessMode).toHaveBeenCalled())
      expect(await screen.findByRole('status')).toHaveTextContent('overview.settings.saved')
    })
  })

  describe('menu bar commands on the Files tab (D11)', () => {
    it('Run from the menu runs the project tests while the Files tab is showing', async () => {
      useProjectStore.setState({ projectPath: '/fake/project', files: [] })
      await act(async () => {
        render(
          <MemoryRouter>
            <Overview />
          </MemoryRouter>
        )
      })
      await openFilesTab()
      const start = vi.fn()
      useRunStore.setState({ start } as never)
      act(() => dispatchMenuCommand('run'))
      expect(start).toHaveBeenCalledTimes(1)
    })

    it('leaves Run to the Tests tab when that tab is showing', async () => {
      useProjectStore.setState({ projectPath: '/fake/project', files: [] })
      await act(async () => {
        render(
          <MemoryRouter>
            <Overview />
          </MemoryRouter>
        )
      })
      const start = vi.fn()
      useRunStore.setState({ start } as never)
      act(() => dispatchMenuCommand('run'))
      expect(start).not.toHaveBeenCalled()
    })

    it('Save from the menu writes the open file only when it has changes', async () => {
      mockApi.readFile.mockResolvedValue({ success: true, data: 'original' })
      useProjectStore.setState({ projectPath: '/fake/project', files: [] })
      await act(async () => {
        render(
          <MemoryRouter>
            <Overview />
          </MemoryRouter>
        )
      })
      await openFilesTab()
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'a_spec.rb' }))
      })
      await act(async () => {
        dispatchMenuCommand('save')
      })
      expect(mockApi.editFile).not.toHaveBeenCalled()
      fireEvent.change(screen.getByTestId('editor'), { target: { value: 'changed' } })
      await act(async () => {
        dispatchMenuCommand('save')
      })
      expect(mockApi.editFile).toHaveBeenCalledWith('/fake/project/spec/a_spec.rb', 'changed')
    })
  })
})
