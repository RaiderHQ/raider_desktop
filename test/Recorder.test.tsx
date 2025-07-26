import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import Recorder from '@pages/Recorder'
import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mocking necessary modules and hooks
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key, // Simple translation mock
  }),
}))

vi.mock('@foundation/Stores/projectStore', () => ({
  __esModule: true,
  default: vi.fn(() => '/fake/project/path'),
}))

vi.mock('@foundation/Stores/rubyStore', () => ({
  __esModule: true,
  default: vi.fn(() => ({
    rubyCommand: '/usr/bin/ruby',
    setRubyCommand: vi.fn(),
  })),
}))

vi.mock('@foundation/Stores/runOutputStore', () => ({
  __esModule: true,
  default: vi.fn(() => ({
    runOutput: '',
    setRunOutput: vi.fn(),
  })),
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
}

beforeEach(() => {
  // @ts-ignore
  window.api = mockApi
  window.electron = {
    // @ts-ignore
    ipcRenderer: {
      on: vi.fn(() => vi.fn()),
      send: vi.fn(),
    },
  }
})

describe('Recorder Page', () => {
  it('renders all main components correctly', async () => {
    await act(async () => {
      render(<Recorder />)
    })

    // Check for main panels and buttons
    expect(screen.getByText('recorder.recorderPage.testSuites')).toBeInTheDocument()
    expect(screen.getByText('recorder.recorderPage.recordedSteps')).toBeInTheDocument()
    expect(screen.getByText('recorder.recorderPage.codeView')).toBeInTheDocument()
    expect(screen.getByText('recorder.recorderPage.testOutput')).toBeInTheDocument()
  })

  it('toggles output panel visibility', async () => {
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

  it('toggles between friendly view and code view', async () => {
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
})
