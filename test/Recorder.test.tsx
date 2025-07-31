import { render, screen, fireEvent, act } from '@testing-library/react'
import Recorder from '@pages/Recorder'
import '@testing-library/jest-dom'
import { vi } from 'vitest'
import { IpcRendererEvent } from 'electron'

// Mocking necessary modules and hooks
vi.mock('react-i18next', () => ({
  useTranslation: (): { t: (key: string) => string } => ({
    t: (key: string): string => key // Simple translation mock
  })
}))

vi.mock('@foundation/Stores/projectStore', () => ({
  __esModule: true,
  default: vi.fn(() => '/fake/project/path')
}))

vi.mock('@foundation/Stores/rubyStore', () => ({
  __esModule: true,
  default: vi.fn(() => ({
    rubyCommand: '/usr/bin/ruby',
    setRubyCommand: vi.fn()
  }))
}))

vi.mock('@foundation/Stores/runOutputStore', () => ({
  __esModule: true,
  default: vi.fn(() => ({
    runOutput: '',
    setRunOutput: vi.fn()
  }))
}))

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
  xpathParser: vi.fn(),
  commandParser: vi.fn(),
  updateRecordingSettings: vi.fn(),
  getSelectorPriorities: vi.fn(),
  saveSelectorPriorities: vi.fn(),
  onTestRunStatus: vi.fn(),
  removeTestRunStatusListener: vi.fn(),
  closeApp: vi.fn()
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
})

describe('Recorder Page', (): void => {
  it('renders all main components correctly', async (): Promise<void> => {
    await act(async () => {
      render(<Recorder />)
    })

    // Check for main panels and buttons
    expect(screen.getByText('recorder.recorderPage.testSuites')).toBeInTheDocument()
    expect(screen.getByText('recorder.recorderPage.recordedSteps')).toBeInTheDocument()
    expect(screen.getByText('recorder.recorderPage.codeView')).toBeInTheDocument()
    expect(screen.getByText('recorder.recorderPage.testOutput')).toBeInTheDocument()
  })

  it('toggles output panel visibility', async (): Promise<void> => {
    await act(async () => {
      render(<Recorder />)
    })
    const toggleButton = screen.getByText('recorder.recorderPage.testOutput')

    // Initially, the output panel is hidden
    expect(screen.queryByText('recorder.recorderPage.runOutput')).not.toBeInTheDocument()

    // Click to show the output panel
    await act(async () => {
      fireEvent.click(toggleButton)
    })
    expect(screen.getByText('recorder.recorderPage.runOutput')).toBeInTheDocument()
    expect(screen.getByText('recorder.recorderPage.hideOutput')).toBeInTheDocument()

    // Click to hide the output panel again
    await act(async () => {
      fireEvent.click(toggleButton)
    })
    expect(screen.queryByText('recorder.recorderPage.runOutput')).not.toBeInTheDocument()
  })

  it('toggles between friendly view and code view', async (): Promise<void> => {
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
