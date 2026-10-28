import { render, screen, fireEvent, act } from '@testing-library/react'
import Recorder from '@pages/Recorder'
import '@testing-library/jest-dom'
import { vi, afterEach } from 'vitest'
import { IpcRendererEvent } from 'electron'
import useRecorderStore from '@foundation/Stores/recorderStore'
import useProjectStoreMock from '@foundation/Stores/projectStore'
import useRubyStoreMock from '@foundation/Stores/rubyStore'
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
  const store: { projectPath: string; layout: unknown } = {
    projectPath: '/fake/project/path',
    layout: null
  }
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

const mockRunOutput = vi.hoisted(() => ({
  runOutput: '',
  runFailed: false,
  setRunOutput: vi.fn(),
  setRunResult: vi.fn()
}))
vi.mock('@foundation/Stores/runOutputStore', () => {
  const store = mockRunOutput
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
  recordOverExample: vi.fn(),
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

    mockApi.saveRecording.mockResolvedValue({ success: true })
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

    describe('while a save is in flight', () => {
      beforeEach(() => {
        mockApi.saveRecording.mockReset()
      })

      afterEach(() => {
        vi.useRealTimers()
        mockApi.saveRecording.mockReset()
      })

      const echoOf = (test: Partial<Test>): unknown[] => [
        {
          id: 's1',
          name: 'Suite',
          tests: [{ id: 't1', name: 'Test', url: 'https://x.test', ...test }]
        }
      ]
      const savedAs = (steps: unknown[]): Partial<Test> => ({
        steps: steps as Test['steps'],
        file: 'spec/test_spec.rb',
        ownership: 'recorded'
      })

      it('keeps steps and the trace recorded meanwhile when the save is echoed back', async () => {
        let finishSave: (value: unknown) => void = () => {}
        mockApi.saveRecording.mockImplementation(
          () => new Promise((resolve) => (finishSave = resolve))
        )
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
        await act(async () => {
          render(<Recorder />)
        })
        const first = { id: 'c1', kind: 'click', element: el }
        const second = { id: 'c2', kind: 'click', element: el }
        const traceStep = { id: 'tr1', command: 'click', timestamp: 1, url: 'https://x.test' }
        await emit('new-recorded-step', first)
        await emit('new-trace-step', traceStep)
        await act(async () => {
          await vi.advanceTimersByTimeAsync(600)
        })
        expect(mockApi.saveRecording).toHaveBeenCalledTimes(1)

        // A click lands while main is still saving the first one
        await emit('new-recorded-step', second)
        // Main echoes what it saved: the older steps, no trace
        await emit('suite-updated', echoOf(savedAs([first])))
        await act(async () => {
          finishSave({ success: true })
        })

        const test = useRecorderStore.getState().activeTest!
        expect(test.steps).toEqual([first, second])
        expect(test.trace).toEqual([traceStep])
        expect(test.file).toBe('spec/test_spec.rb')
        expect(test.ownership).toBe('recorded')
      })

      it('an echo that changes nothing does not trigger another save', async () => {
        mockApi.saveRecording.mockResolvedValue({ success: true })
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
        await act(async () => {
          render(<Recorder />)
        })
        const first = { id: 'c1', kind: 'click', element: el }
        await emit('new-recorded-step', first)
        await act(async () => {
          await vi.advanceTimersByTimeAsync(600)
        })
        await emit('suite-updated', echoOf(savedAs([first])))
        await act(async () => {
          await vi.advanceTimersByTimeAsync(600)
        })
        // The merged file name is a change; once merged, repeating the echo is not
        await emit('suite-updated', echoOf(savedAs([first])))
        await act(async () => {
          await vi.advanceTimersByTimeAsync(2000)
        })
        expect(mockApi.saveRecording).toHaveBeenCalledTimes(2)
      })

      it('keeps steps that arrive while the trace is saved on stop', async () => {
        let finishTrace: (value: unknown) => void = () => {}
        mockApi.saveTrace.mockImplementationOnce(
          () => new Promise((resolve) => (finishTrace = resolve))
        )
        mockApi.saveRecording.mockResolvedValue({ success: true })
        await act(async () => {
          render(<Recorder />)
        })
        const first = { id: 'c1', kind: 'click', element: el }
        const last = { id: 'c2', kind: 'click', element: el }
        const traceStep = { id: 'tr1', command: 'click', timestamp: 1, url: 'https://x.test' }
        await emit('new-recorded-step', first)
        await emit('new-trace-step', traceStep)
        // Not awaited: the handler waits for the trace save, which is still pending
        let stopped: unknown
        await act(async () => {
          stopped = ipcListeners.get('recording-stopped')?.({} as IpcRendererEvent)
        })
        // The last click was sent just before Stop and lands while the trace is saved
        await emit('new-recorded-step', last)
        await act(async () => {
          finishTrace({ success: true })
          await stopped
        })

        const test = useRecorderStore.getState().activeTest!
        expect(test.steps).toEqual([first, last])
        expect(test.hasTrace).toBe(true)
        expect(test.trace).toEqual([traceStep])
      })

      it('turns read-only when main says a developer took the test over', async () => {
        mockApi.saveRecording.mockResolvedValue({ success: true })
        mockApi.openCodeTest.mockResolvedValue({ file: 'spec/test_spec.rb', examples: [] })
        await act(async () => {
          render(<Recorder />)
        })
        const first = { id: 'c1', kind: 'click', element: el }
        await emit('new-recorded-step', first)
        await emit(
          'suite-updated',
          echoOf({ steps: [], file: 'spec/test_spec.rb', ownership: 'codeOwnedWasRecorded' })
        )
        expect(useRecorderStore.getState().activeTest!.ownership).toBe('codeOwnedWasRecorded')
        expect(steps()).toEqual([first])
        expect(screen.getByText('recorder.readOnly.banner')).toBeInTheDocument()
      })
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

  describe('read-only and project support', () => {
    const codeSteps = [{ id: 'k', kind: 'click', element: { strategy: 'id', value: 'go' } }]
    const recordedTest: Test = {
      id: 't1',
      name: 'Recorded one',
      url: 'https://x.test',
      steps: [{ id: 'k', kind: 'click', element: { strategy: 'id', value: 'go' } }] as Test['steps']
    }

    beforeEach(() => {
      vi.clearAllMocks()
      mockApi.getSuites.mockResolvedValue([])
      mockApi.saveRecording.mockResolvedValue({ success: true })
      ;(useProjectStoreMock.getState() as { layout: unknown }).layout = null
    })

    afterEach(() => {
      vi.useRealTimers()
      useRecorderStore.setState({ readOnlyView: null })
    })

    const openView = async (): Promise<void> => {
      useRecorderStore.setState({
        suites: [],
        activeSuiteId: null,
        activeTest: null,
        readOnlyView: {
          file: 'spec/api_spec.rb',
          examples: [{ name: 'responds quickly', steps: codeSteps as never }]
        }
      })
      await act(async () => {
        render(<Recorder />)
      })
    }

    it('view opens read-only', async () => {
      await openView()
      expect(screen.getByText('recorder.readOnly.banner')).toBeInTheDocument()
      expect(screen.getByText('responds quickly')).toBeInTheDocument()
      expect(screen.getByLabelText('recorder.mainRecorderPanel.run')).toBeInTheDocument()
      expect(screen.queryByLabelText('recorder.mainRecorderPanel.record')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Delete step')).not.toBeInTheDocument()
      expect(screen.queryByText('recorder.mainRecorderPanel.newTest')).not.toBeInTheDocument()
    })

    it('read-only run uses the project file', async () => {
      mockApi.runProjectFile.mockResolvedValue({ success: true, output: 'ok' })
      await openView()
      await act(async () => {
        fireEvent.click(screen.getByLabelText('recorder.mainRecorderPanel.run'))
      })
      expect(mockApi.runProjectFile).toHaveBeenCalledWith('spec/api_spec.rb', '/usr/bin/ruby')
      expect(mockApi.runTest).not.toHaveBeenCalled()
    })

    it('a failed read-only run is kept as failed', async () => {
      const output = '0 examples, 0 failures, 1 error occurred outside of examples'
      mockApi.runProjectFile.mockResolvedValue({ success: false, output })
      await openView()
      await act(async () => {
        fireEvent.click(screen.getByLabelText('recorder.mainRecorderPanel.run'))
      })
      expect(mockRunOutput.setRunResult).toHaveBeenCalledWith(output, false)
    })

    it('shows Failed for a failed run that rspec counted as 0 failures', async () => {
      mockRunOutput.runOutput = '0 examples, 0 failures, 1 error occurred outside of examples'
      mockRunOutput.runFailed = true
      try {
        await openView()
        expect(screen.getByText('Failed')).toBeInTheDocument()
        expect(screen.queryByText('Passed')).not.toBeInTheDocument()
      } finally {
        mockRunOutput.runOutput = ''
        mockRunOutput.runFailed = false
      }
    })

    it('read-only never autosaves', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout'] })
      await openView()
      useRecorderStore.setState({ activeSuiteId: 's1', activeTest: recordedTest })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(600)
      })
      expect(mockApi.saveRecording).not.toHaveBeenCalled()
    })

    it('codeOwned save flips to read-only', async () => {
      mockApi.saveRecording.mockResolvedValue({ success: false, error: 'codeOwned' })
      const suites = [{ id: 's1', name: 'Suite', tests: [recordedTest] }]
      mockApi.getSuites.mockResolvedValue(suites)
      useRecorderStore.setState({ suites, activeSuiteId: 's1', activeTest: recordedTest })
      vi.useFakeTimers({ toFake: ['setTimeout'] })
      await act(async () => {
        render(<Recorder />)
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(600)
      })
      expect(screen.getByText('recorder.readOnly.banner')).toBeInTheDocument()
      expect(mockToast.error).not.toHaveBeenCalled()
      expect(screen.queryByLabelText('recorder.mainRecorderPanel.record')).not.toBeInTheDocument()
      expect(mockApi.saveRecording).toHaveBeenCalledTimes(1)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000)
      })
      expect(mockApi.saveRecording).toHaveBeenCalledTimes(1)
    })

    it('shows a plain message, not the raw error, when a save fails', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockApi.saveRecording.mockResolvedValue({ success: false, error: 'EACCES: /secret/path' })
      const suites = [{ id: 's1', name: 'Suite', tests: [recordedTest] }]
      mockApi.getSuites.mockResolvedValue(suites)
      useRecorderStore.setState({ suites, activeSuiteId: 's1', activeTest: recordedTest })
      vi.useFakeTimers({ toFake: ['setTimeout'] })
      await act(async () => {
        render(<Recorder />)
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(600)
      })
      expect(mockToast.error).toHaveBeenCalledWith(
        'recorder.saveFailed',
        expect.anything()
      )
      expect(JSON.stringify(mockToast.error.mock.calls)).not.toContain('EACCES')
      expect(spy).toHaveBeenCalled()
      spy.mockRestore()
    })

    it('unsupported project shows upgrade message', async () => {
      ;(useProjectStoreMock.getState() as { layout: unknown }).layout = {
        framework: 'rspec',
        automation: 'selenium',
        recordable: false,
        unsupportedReason: 'minitest'
      }
      const suites = [{ id: 's1', name: 'Suite', tests: [recordedTest] }]
      mockApi.getSuites.mockResolvedValue(suites)
      useRecorderStore.setState({ suites, activeSuiteId: 's1', activeTest: recordedTest })
      await act(async () => {
        render(<Recorder />)
      })
      expect(screen.getByText('recorder.unsupported.title')).toBeInTheDocument()
      expect(screen.getByText('recorder.unsupported.minitest')).toBeInTheDocument()
      expect(screen.getByLabelText('recorder.mainRecorderPanel.record')).toBeDisabled()
    })


    it('after a project switch, a leftover test is not shown behind a read-only view', async () => {
      const stale: Test = { id: 'tA', name: 'T_A', url: '', steps: [] }
      const suitesB = [
        { id: 'sB', name: 'B', tests: [{ id: 'tB', name: 'T_B', url: '', steps: [] }] }
      ]
      mockApi.getSuites.mockResolvedValue(suitesB)
      useRecorderStore.setState({
        activeSuiteId: 'sA',
        activeTest: stale,
        readOnlyView: { file: 'spec/b_spec.rb', examples: [] }
      })
      await act(async () => {
        render(<Recorder />)
      })
      expect(useRecorderStore.getState().activeTest?.id).toBe('tB')
      expect(useRecorderStore.getState().activeSuiteId).toBe('sB')
    })

    it('Run in a read-only view without Ruby says so and runs nothing', async () => {
      useRubyStoreMock.getState().rubyCommand = null as never
      await openView()
      await act(async () => {
        fireEvent.click(screen.getByLabelText('recorder.mainRecorderPanel.run'))
      })
      useRubyStoreMock.getState().rubyCommand = '/usr/bin/ruby'
      expect(mockApi.runProjectFile).not.toHaveBeenCalled()
      expect(mockRunOutput.setRunOutput).toHaveBeenCalledWith('recorder.noRuby')
    })

    it('read-only run message names the viewed test', async () => {
      mockApi.runProjectFile.mockResolvedValue({ success: true, output: 'ok' })
      useRecorderStore.setState({ readOnlyTitle: 'Checkout flow' })
      await openView()
      useRecorderStore.setState({ readOnlyTitle: 'Checkout flow' })
      await act(async () => {
        fireEvent.click(screen.getByLabelText('recorder.mainRecorderPanel.run'))
      })
      expect(mockRunOutput.setRunOutput).toHaveBeenCalledWith('Running test: Checkout flow...')
    })

    it('a rename is saved before switching to another test', async () => {
      const t2: Test = { id: 't2', name: 'Second', url: '', steps: [] }
      const suites = [{ id: 's1', name: 'Suite', tests: [recordedTest, t2] }]
      mockApi.getSuites.mockResolvedValue(suites)
      useRecorderStore.setState({ suites, activeSuiteId: 's1', activeTest: recordedTest })
      await act(async () => {
        render(<Recorder />)
      })
      const input = screen.getByDisplayValue('Recorded one')
      fireEvent.change(input, { target: { value: 'Renamed' } })
      await act(async () => {
        fireEvent.blur(input)
        fireEvent.click(screen.getByText('Second'))
      })
      expect(mockApi.saveRecording).toHaveBeenCalledWith(
        's1',
        expect.objectContaining({ id: 't1', name: 'Renamed' })
      )
    })

    it('stops an ongoing recording when a save says the test is code-owned', async () => {
      mockApi.saveRecording.mockResolvedValue({ success: false, error: 'codeOwned' })
      mockApi.stopRecordingMain.mockResolvedValue({ success: true })
      const suites = [{ id: 's1', name: 'Suite', tests: [recordedTest] }]
      mockApi.getSuites.mockResolvedValue(suites)
      useRecorderStore.setState({
        suites,
        activeSuiteId: 's1',
        activeTest: recordedTest,
        isRecording: true
      })
      vi.useFakeTimers({ toFake: ['setTimeout'] })
      await act(async () => {
        render(<Recorder />)
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(600)
      })
      expect(mockApi.stopRecordingMain).toHaveBeenCalled()
      expect(screen.getByText('recorder.readOnly.banner')).toBeInTheDocument()
      useRecorderStore.setState({ isRecording: false })
    })

    describe('a code-owned test picked in the suite list', () => {
      const ownedTest: Test = {
        id: 't9',
        name: 'Checkout',
        url: '',
        file: 'spec/checkout_spec.rb',
        ownership: 'codeOwnedWasRecorded',
        // What Raider last saved; the developer has since rewritten the file
        steps: [{ id: 'old', kind: 'navigate', url: 'https://stale.test' }] as Test['steps']
      }
      const fileSteps = [{ id: 'new', kind: 'click', element: { strategy: 'id', value: 'pay' } }]
      const savedStep = /commandParser\.visit/
      const fileStep = /commandParser\.clickElement/

      const openOwned = async (): Promise<void> => {
        const suites = [{ id: 's1', name: 'Smoke suite', tests: [ownedTest] }]
        mockApi.getSuites.mockResolvedValue(suites)
        useRecorderStore.setState({ suites, activeSuiteId: 's1', activeTest: ownedTest })
        await act(async () => {
          render(<Recorder />)
        })
      }

      it('shows what the file holds now, not the steps Raider last saved', async () => {
        mockApi.openCodeTest.mockResolvedValue({
          file: 'spec/checkout_spec.rb',
          examples: [{ name: 'pays by card', steps: fileSteps }]
        })
        await openOwned()
        expect(mockApi.openCodeTest).toHaveBeenCalledWith('spec/checkout_spec.rb')
        expect(screen.getByText('pays by card')).toBeInTheDocument()
        expect(screen.getByText(fileStep)).toBeInTheDocument()
        expect(screen.queryByText(savedStep)).not.toBeInTheDocument()
        // The suite list stays, so the user can pick another test
        expect(screen.getByText('Smoke suite')).toBeInTheDocument()
        expect(screen.getByText('recorder.readOnly.banner')).toBeInTheDocument()
      })

      it('never falls back to the old steps when the file cannot be read', async () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
        mockApi.openCodeTest.mockRejectedValue(new Error('gone'))
        await openOwned()
        expect(screen.getByText('recorder.readOnly.loadFailed')).toBeInTheDocument()
        expect(screen.queryByText(savedStep)).not.toBeInTheDocument()
        spy.mockRestore()
      })
    })

    it('cucumber project shows the notice', async () => {
      ;(useProjectStoreMock.getState() as { layout: unknown }).layout = {
        framework: 'cucumber',
        automation: 'selenium',
        recordable: true
      }
      await act(async () => {
        render(<Recorder />)
      })
      expect(screen.getByText('recorder.cucumberNotice')).toBeInTheDocument()
    })
  })
})
