import { render, screen, fireEvent, act } from '@testing-library/react'
import Recorder from '@pages/Recorder'
import '@testing-library/jest-dom'
import { vi } from 'vitest'
import { IpcRendererEvent } from 'electron'
import useRecorderStore from '@foundation/Stores/recorderStore'

// Mocking necessary modules and hooks
vi.mock('react-i18next', () => ({
  useTranslation: (): { t: (key: string) => string } => ({
    t: (key: string): string => key // Simple translation mock
  })
}))

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn(), loading: vi.fn() },
  toast: { success: vi.fn(), error: vi.fn(), loading: vi.fn() },
  Toaster: () => null
}))

vi.mock('@foundation/Stores/projectStore', () => {
  const store = { projectPath: '/fake/project/path' }
  const useProjectStore = (selector?: (s: typeof store) => unknown) =>
    selector ? selector(store) : store
  useProjectStore.getState = () => store
  return { __esModule: true, default: useProjectStore }
})

vi.mock('@foundation/Stores/rubyStore', () => {
  const store = { rubyCommand: '/usr/bin/ruby', setRubyCommand: vi.fn(), rubyVersion: '3.2.0', versionWarning: null, setRubyVersion: vi.fn(), setVersionWarning: vi.fn() }
  const useRubyStore = (selector?: (s: typeof store) => unknown) =>
    selector ? selector(store) : store
  useRubyStore.getState = () => store
  return { __esModule: true, default: useRubyStore }
})

vi.mock('@foundation/Stores/runOutputStore', () => {
  const store = { runOutput: '', setRunOutput: vi.fn() }
  const useRunOutputStore = (selector?: (s: typeof store) => unknown) =>
    selector ? selector(store) : store
  useRunOutputStore.getState = () => store
  return { __esModule: true, default: useRunOutputStore }
})

// Use the real recorderStore — it's a Zustand store that triggers React re-renders

// Mocking electron API
const mockApi = {
  saveRecording: vi.fn(),
  createSuite: vi.fn(),
  deleteSuite: vi.fn(),
  deleteTest: vi.fn(),
  loadUrlRequest: vi.fn(),
  startRecordingMain: vi.fn(),
  stopRecordingMain: vi.fn(),
  runTest: vi.fn(),
  runSuite: vi.fn(),
  exportTest: vi.fn(),
  exportSuite: vi.fn(),
  exportProject: vi.fn(),
  importTest: vi.fn(),
  importSuite: vi.fn(),
  importProject: vi.fn(),
  installRbenvAndRuby: vi.fn(),
  installGems: vi.fn(),
  isRubyInstalled: vi.fn().mockResolvedValue({ success: true, rubyCommand: '/usr/bin/ruby' }),
  getSuites: vi.fn().mockResolvedValue([]),
  runRubyRaider: vi.fn(),
  selectFolder: vi.fn(),
  readDirectory: vi.fn(),
  readFile: vi.fn(),
  readImage: vi.fn(),
  editFile: vi.fn(),
  openAllure: vi.fn(),
  runRaiderTests: vi.fn(),
  runRakeTask: vi.fn(),
  rerunFailedTests: vi.fn(),
  updateBrowserUrl: vi.fn(),
  updateBrowserType: vi.fn(),
  isMobileProject: vi.fn(),
  runCommand: vi.fn(),
  installRaider: vi.fn(),
  updateMobileCapabilities: vi.fn(),
  getMobileCapabilities: vi.fn(),
  isRbenvRubyInstalled: vi.fn(),
  isRvmRubyInstalled: vi.fn(),
  isSystemRubyInstalled: vi.fn(),
  xpathParser: vi.fn().mockResolvedValue(''),
  commandParser: vi.fn().mockResolvedValue(''),
  updateRecordingSettings: vi.fn(),
  onTestRunStatus: vi.fn(),
  removeTestRunStatusListener: vi.fn(),
  closeApp: vi.fn(),
  scaffoldGenerate: vi.fn().mockResolvedValue({ success: true, output: 'Generated successfully' }),
  saveTrace: vi.fn().mockResolvedValue({ success: true }),
  loadTrace: vi.fn().mockResolvedValue({ success: false }),
  deleteTrace: vi.fn().mockResolvedValue(undefined),
  updateTimeout: vi.fn().mockResolvedValue({ success: true, output: '' }),
  updateViewport: vi.fn().mockResolvedValue({ success: true, output: '' }),
  updateDebugMode: vi.fn().mockResolvedValue({ success: true, output: '' }),
  updateBrowserOptions: vi.fn().mockResolvedValue({ success: true, output: '' }),
  startAppium: vi.fn().mockResolvedValue({ success: true, output: '' }),
  updatePaths: vi.fn().mockResolvedValue({ success: true, output: '' }),
  updateHeadlessMode: vi.fn().mockResolvedValue({ success: true }),
  getProjectConfig: vi.fn().mockResolvedValue({ success: true, config: {} }),
  deleteFile: vi.fn().mockResolvedValue({ success: true }),
  renameFile: vi.fn().mockResolvedValue({ success: true, newPath: '' }),
  duplicateFile: vi.fn().mockResolvedValue({ success: true, newPath: '' }),
  registerRecorderWebContents: vi.fn().mockResolvedValue(undefined),
  terminalSpawn: vi.fn().mockResolvedValue(undefined),
  terminalWrite: vi.fn().mockResolvedValue(undefined),
  terminalResize: vi.fn().mockResolvedValue(undefined),
  terminalKill: vi.fn().mockResolvedValue(undefined),
  onTerminalData: vi.fn().mockReturnValue({ on: vi.fn() }),
  removeTerminalDataListener: vi.fn().mockReturnValue({ on: vi.fn() }),
  onTerminalExit: vi.fn().mockReturnValue({ on: vi.fn() }),
  removeTerminalExitListener: vi.fn().mockReturnValue({ on: vi.fn() }),
  replayStepsAndRecord: vi.fn().mockResolvedValue({ success: true, url: 'http://localhost', preloadPath: '/path/to/preload.js' }),
  cancelReplay: vi.fn().mockResolvedValue({ success: true }),
  replayInWebview: vi.fn().mockResolvedValue({ success: true }),
  getLongshipConfig: vi.fn().mockResolvedValue({ url: '', apiKey: '', enabled: false }),
  setLongshipConfig: vi.fn().mockResolvedValue({ url: '', apiKey: '', enabled: false })
}

let suiteUpdatedCallback: (event: IpcRendererEvent, updatedSuites: unknown) => void = () => {}

beforeEach(() => {
  window.api = mockApi
  window.electron = {
    ipcRenderer: {
      on: (
        channel: string,
        callback: (event: IpcRendererEvent, ...args: unknown[]) => void
      ): (() => void) => {
        if (channel === 'suite-updated') {
          suiteUpdatedCallback = callback
        }
        return () => {}
      },
      send: vi.fn(),
      invoke: vi.fn(),
      once: vi.fn(),
      removeListener: vi.fn(),
      removeAllListeners: vi.fn(),
      postMessage: vi.fn(),
      sendSync: vi.fn(),
      sendTo: vi.fn(),
      sendToHost: vi.fn()
    },
    webFrame: {
      setZoomFactor: vi.fn(),
      insertCSS: vi.fn(),
      setZoomLevel: vi.fn()
    },
    process: {
      platform: 'darwin',
      versions: {},
      env: {}
    },
    webUtils: {
      getPathForFile: vi.fn()
    }
  }

  // Reset the real store state before each test
  useRecorderStore.setState({
    suites: [],
    activeSuiteId: null,
    activeTest: null,
    isRecording: false,
    isRunning: false,
    showCode: false,
    isOutputVisible: false
  })
})

describe('Recorder Page', (): void => {
  it('renders tab navigation and default recording tab', async (): Promise<void> => {
    await act(async () => {
      render(<Recorder />)
    })

    // Check tab buttons are rendered
    expect(screen.getByText('recorder.tabs.recording')).toBeInTheDocument()
    expect(screen.getByText('recorder.tabs.dashboard')).toBeInTheDocument()
    // Recording tab content is shown by default
    expect(screen.getByText('recorder.recorderPage.testSuites')).toBeInTheDocument()
    expect(screen.getByText('recorder.recorderPage.noSuiteSteps')).toBeInTheDocument()
  })

  it('switches to dashboard tab', async (): Promise<void> => {
    await act(async () => {
      render(<Recorder />)
    })

    await act(async () => {
      fireEvent.click(screen.getByText('recorder.tabs.dashboard'))
    })

    // Recording content should be hidden
    expect(screen.queryByText('recorder.recorderPage.testSuites')).not.toBeInTheDocument()
  })

  it('toggles output panel visibility', async (): Promise<void> => {
    // Need an active suite and test for toolbar buttons to render
    useRecorderStore.setState({
      suites: [{ id: 's1', name: 'Suite', tests: [{ id: 't1', name: 'Test', url: '', steps: [] }] }],
      activeSuiteId: 's1',
      activeTest: { id: 't1', name: 'Test', url: '', steps: [] }
    })

    await act(async () => {
      render(<Recorder />)
    })

    // Initially shows "Test Output" button (drawer is collapsed)
    expect(screen.getByText('recorder.recorderPage.testOutput')).toBeInTheDocument()

    // Click to show the output panel
    await act(async () => {
      fireEvent.click(screen.getByText('recorder.recorderPage.testOutput'))
    })
    expect(screen.getByText('recorder.recorderPage.hideOutput')).toBeInTheDocument()

    // Click to hide the output panel again
    await act(async () => {
      fireEvent.click(screen.getByText('recorder.recorderPage.hideOutput'))
    })
    expect(screen.getByText('recorder.recorderPage.testOutput')).toBeInTheDocument()
  })

  it('toggles between friendly view and code view', async (): Promise<void> => {
    // Need an active suite and test for toolbar buttons to render
    useRecorderStore.setState({
      suites: [{ id: 's1', name: 'Suite', tests: [{ id: 't1', name: 'Test', url: '', steps: [] }] }],
      activeSuiteId: 's1',
      activeTest: { id: 't1', name: 'Test', url: '', steps: [] }
    })

    await act(async () => {
      render(<Recorder />)
    })
    const toggleButton = screen.getByText('recorder.recorderPage.codeView')

    // Initially, it's in friendly view
    expect(screen.getByText('recorder.recorderPage.codeView')).toBeInTheDocument()

    // Click to switch to code view
    await act(async () => {
      fireEvent.click(toggleButton)
    })
    expect(screen.getByText('recorder.recorderPage.friendlyView')).toBeInTheDocument()

    // Click to switch back to friendly view
    await act(async () => {
      fireEvent.click(toggleButton)
    })
    expect(screen.getByText('recorder.recorderPage.codeView')).toBeInTheDocument()
  })

  it('creates a new test and displays it', async () => {
    const initialSuites = [{ id: 'suite-1', name: 'My Suite', tests: [] }]
    mockApi.getSuites.mockResolvedValue(initialSuites)

    await act(async () => {
      render(<Recorder />)
    })

    const newTestButton = screen.getByText('recorder.mainRecorderPanel.newTest')
    await act(async () => {
      fireEvent.click(newTestButton)
    })

    const newTest = {
      id: expect.any(String),
      name: 'Untitled Test',
      url: 'https://www.wikipedia.org',
      steps: []
    }

    const updatedSuites = [
      {
        id: 'suite-1',
        name: 'My Suite',
        tests: [newTest]
      }
    ]

    await act(async () => {
      suiteUpdatedCallback({} as IpcRendererEvent, updatedSuites)
    })

    expect(screen.getByText('Untitled Test')).toBeInTheDocument()
  })
})
