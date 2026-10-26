import { render, screen, fireEvent, act } from '@testing-library/react'
import Recorder from '@pages/Recorder'
import '@testing-library/jest-dom'
import { vi } from 'vitest'
import { IpcRendererEvent } from 'electron'
import useRecorderStore from '@foundation/Stores/recorderStore'
import type { Test } from '@foundation/Types/test'

// Mocking necessary modules and hooks
vi.mock('react-i18next', () => ({
  useTranslation: (): { t: (key: string) => string } => ({
    t: (key: string): string => key // Simple translation mock
  })
}))

const mockToast = vi.hoisted(() =>
  Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), loading: vi.fn() })
)
vi.mock('react-hot-toast', () => ({
  default: mockToast,
  toast: mockToast,
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
  listProjectTests: vi.fn().mockResolvedValue([]),
  openCodeTest: vi.fn(),
  getProjectLayout: vi.fn().mockResolvedValue(null),
  runProjectFile: vi.fn(),
  runRubyRaider: vi.fn(),
  selectFolder: vi.fn(),
  readDirectory: vi.fn(),
  readFile: vi.fn(),
  readImage: vi.fn(),
  editFile: vi.fn(),
  openReport: vi.fn(),
  reportExists: vi.fn(),
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
  renderStep: vi.fn().mockResolvedValue(''),
  updateRecordingSettings: vi.fn().mockResolvedValue({ success: true }),
  setActiveProject: vi.fn(),
  getRecorderSettings: vi.fn().mockResolvedValue({ implicitWait: 3, explicitWait: 25 }),
  onTestRunStatus: vi.fn(),
  removeTestRunStatusListener: vi.fn(),
  onTestsMigrated: vi.fn(),
  removeTestsMigratedListener: vi.fn(),
  onSuitesTooNew: vi.fn(),
  removeSuitesTooNewListener: vi.fn(),
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
const ipcListeners = new Map<string, (event: IpcRendererEvent, ...args: unknown[]) => unknown>()
const emit = async (channel: string, ...args: unknown[]): Promise<void> => {
  await act(async () => {
    await ipcListeners.get(channel)?.({} as IpcRendererEvent, ...args)
  })
}

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
        ipcListeners.set(channel, callback)
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
  it('shows wait values from project settings and never reads localStorage', async (): Promise<void> => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem')
    await act(async () => {
      render(<Recorder />)
    })

    expect(screen.getByLabelText('settings.recording.implicitWait.label')).toHaveValue(3)
    expect(screen.getByLabelText('settings.recording.explicitWait.label')).toHaveValue(25)
    expect(getItem).not.toHaveBeenCalledWith('implicitWait')
    expect(getItem).not.toHaveBeenCalledWith('explicitWait')
    getItem.mockRestore()
  })

  it('saves a changed wait to the project config on blur', async (): Promise<void> => {
    await act(async () => {
      render(<Recorder />)
    })
    const input = screen.getByLabelText('settings.recording.explicitWait.label')
    await act(async () => {
      fireEvent.change(input, { target: { value: '30' } })
    })
    await act(async () => {
      fireEvent.blur(input)
    })

    expect(mockApi.updateRecordingSettings).toHaveBeenCalledWith({ explicitWait: 30 })
  })

  it('does not save a wait on blur when settings failed to load', async (): Promise<void> => {
    mockApi.getRecorderSettings.mockRejectedValueOnce(new Error('no project'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    await act(async () => {
      render(<Recorder />)
    })
    vi.mocked(mockApi.updateRecordingSettings).mockClear()
    await act(async () => {
      fireEvent.blur(screen.getByLabelText('settings.recording.explicitWait.label'))
    })
    expect(mockApi.updateRecordingSettings).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

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

  describe('recording steps', () => {
    const el = { strategy: 'id' as const, value: 'greeting', label: 'Greeting' }

    beforeEach(() => {
      const test = { id: 't1', name: 'Test', url: 'https://x.test', steps: [] }
      const suites = [{ id: 's1', name: 'Suite', tests: [test] }]
      // The page loads suites on mount and selects the first test
      mockApi.getSuites.mockResolvedValue(suites)
      useRecorderStore.setState({ suites, activeSuiteId: 's1', activeTest: test })
    })

    const steps = (): unknown[] => useRecorderStore.getState().activeTest!.steps

    it('starts a recording with a navigate step', async () => {
      await act(async () => {
        render(<Recorder />)
      })
      await emit('recording-started', 'https://x.test/start')
      expect(steps()).toEqual([
        { id: expect.any(String), kind: 'navigate', url: 'https://x.test/start' }
      ])
    })

    it('appends recorded steps', async () => {
      await act(async () => {
        render(<Recorder />)
      })
      const click = { id: 'c1', kind: 'click', element: el }
      await emit('new-recorded-step', click)
      expect(steps()).toEqual([click])
    })

    it('appends assertion steps that need no text', async () => {
      await act(async () => {
        render(<Recorder />)
      })
      const step = { id: 'a1', kind: 'assert', check: 'displayed', element: el }
      await emit('add-assertion-step', step)
      expect(steps()).toEqual([step])
    })

    it('adds the Step from the assertion modal, with no Ruby in the store', async () => {
      await act(async () => {
        render(<Recorder />)
      })
      await emit('add-assertion-step', { pendingAssertion: 'textIncludes', element: el, text: 'Hi' })

      expect(screen.getByText('recorder.assertionTextModal.titles.text-includes')).toBeInTheDocument()
      await act(async () => {
        fireEvent.change(screen.getByDisplayValue('Hi'), { target: { value: 'Hi there' } })
      })
      await act(async () => {
        fireEvent.click(screen.getByText('recorder.assertionTextModal.save'))
      })

      expect(steps()).toEqual([
        {
          id: expect.any(String),
          kind: 'assert',
          check: 'textIncludes',
          element: el,
          expected: 'Hi there'
        }
      ])
      expect(JSON.stringify(useRecorderStore.getState())).not.toMatch(/@driver|@browser/)
    })

    it('adds page assertions from the modal without an element', async () => {
      await act(async () => {
        render(<Recorder />)
      })
      await emit('add-assertion-step', { pendingAssertion: 'titleEquals', text: 'Home' })
      await act(async () => {
        fireEvent.click(screen.getByText('recorder.assertionTextModal.save'))
      })
      expect(steps()).toEqual([
        { id: expect.any(String), kind: 'assert', check: 'titleEquals', expected: 'Home' }
      ])
    })
  })

  describe('start URL', () => {
    const useTest = (url: string): void => {
      const test: Test = { id: 't1', name: 'Test', url, steps: [] }
      const suites = [{ id: 's1', name: 'Suite', tests: [test] }]
      mockApi.getSuites.mockResolvedValue(suites)
      useRecorderStore.setState({ suites, activeSuiteId: 's1', activeTest: test })
    }
    const clickRecord = async (): Promise<void> => {
      await act(async () => {
        fireEvent.click(screen.getByLabelText('recorder.mainRecorderPanel.record'))
      })
    }

    beforeEach(() => {
      vi.clearAllMocks()
      mockApi.startRecordingMain.mockResolvedValue({
        success: true,
        url: 'https://base.test/',
        preloadPath: '/p.js'
      })
    })

    it("starts at the test's own URL when it has one", async () => {
      useTest('https://own.test/')
      await act(async () => {
        render(<Recorder />)
      })
      await clickRecord()
      expect(mockApi.loadUrlRequest).toHaveBeenCalledWith('https://own.test/')
      expect(mockApi.startRecordingMain).toHaveBeenCalled()
    })

    it('falls back to the project base URL when the test has none', async () => {
      useTest('')
      await act(async () => {
        render(<Recorder />)
      })
      await clickRecord()
      // An empty URL clears any URL left over from another test, so main uses the base URL
      expect(mockApi.loadUrlRequest).toHaveBeenCalledWith('')
      expect(mockApi.startRecordingMain).toHaveBeenCalled()
      expect(mockToast.error).not.toHaveBeenCalled()
    })

    it('tells the user when there is no URL anywhere', async () => {
      useTest('')
      mockApi.startRecordingMain.mockResolvedValue({ success: false, url: '', preloadPath: '' })
      await act(async () => {
        render(<Recorder />)
      })
      await clickRecord()
      expect(mockToast.error).toHaveBeenCalledWith('recorder.noStartUrl')
    })
  })

  describe('record from here', () => {
    const recordFromHere = async (replayResult: object): Promise<void> => {
      const test: Test = {
        id: 't1',
        name: 'Test',
        url: 'https://x.test',
        steps: [
          { id: 'c', kind: 'custom', code: 'puts 1' },
          { id: 'k', kind: 'click', element: { strategy: 'id', value: 'go' } }
        ]
      }
      const suites = [{ id: 's1', name: 'Suite', tests: [test] }]
      mockApi.getSuites.mockResolvedValue(suites)
      useRecorderStore.setState({
        suites,
        activeSuiteId: 's1',
        activeTest: test,
        breakpointIndex: 1
      })
      mockApi.startRecordingMain.mockResolvedValue({
        success: true,
        url: 'https://x.test',
        preloadPath: '/p.js'
      })
      mockApi.replayInWebview.mockResolvedValue(replayResult)
      await act(async () => {
        render(<Recorder />)
      })
      vi.useFakeTimers({ toFake: ['setTimeout'] })
      try {
        await act(async () => {
          fireEvent.click(screen.getByText(/recorder\.breakpoint\.recordFromHere/))
        })
        await act(async () => {
          await vi.advanceTimersByTimeAsync(2000)
        })
      } finally {
        vi.useRealTimers()
      }
    }

    beforeEach(() => vi.clearAllMocks())

    it('warns when replay skipped steps', async () => {
      await recordFromHere({ success: true, skippedStepIds: ['c'] })
      expect(mockApi.replayInWebview).toHaveBeenCalled()
      expect(mockToast).toHaveBeenCalledWith(
        'recorder.breakpoint.skippedSteps',
        expect.objectContaining({ icon: expect.any(String) })
      )
    })

    it('does not warn when nothing was skipped', async () => {
      await recordFromHere({ success: true, skippedStepIds: [] })
      expect(mockApi.replayInWebview).toHaveBeenCalled()
      expect(mockToast).not.toHaveBeenCalled()
    })
  })
})
