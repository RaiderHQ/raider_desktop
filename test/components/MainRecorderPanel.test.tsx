import { render, screen, act } from '@testing-library/react'
import MainRecorderPanel from '@components/MainRecorderPanel'
import '@testing-library/jest-dom'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: object) => opts ? `${key} ${JSON.stringify(opts)}` : key })
}))

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() }, Toaster: () => null }))

const baseProps = {
  activeSuiteName: 'My Suite',
  activeTest: { id: 't1', name: 'Test 1', url: 'https://example.com', steps: [] },
  isRecording: false,
  isRunning: false,
  onTestNameChange: vi.fn(),
  onUrlChange: vi.fn(),
  onStartRecording: vi.fn(),
  onRunTest: vi.fn(),
  onStopRecording: vi.fn(),
  onNewTest: vi.fn(),
  onExportTest: vi.fn().mockResolvedValue({ success: true, path: '/out' }),
  onExportSuite: vi.fn().mockResolvedValue({ success: true, path: '/out' }),
  onExportProject: vi.fn().mockResolvedValue({ success: true, path: '/out' }),
  onImportTest: vi.fn().mockResolvedValue({ success: true }),
  onImportSuite: vi.fn().mockResolvedValue({ success: true }),
  onImportProject: vi.fn().mockResolvedValue({ success: true }),
  activeSuiteId: 'suite-1'
}

describe('MainRecorderPanel', () => {
  it('renders the suite name', async () => {
    await act(async () => { render(<MainRecorderPanel {...baseProps} />) })
    expect(screen.getByText(/My Suite/)).toBeInTheDocument()
  })

  it('shows "no suite" message when no active suite', async () => {
    await act(async () => {
      render(<MainRecorderPanel {...baseProps} activeSuiteName={undefined} activeSuiteId={null} />)
    })
    expect(screen.getByText('recorder.mainRecorderPanel.noSuite')).toBeInTheDocument()
  })

  it('renders test name and URL inputs', async () => {
    await act(async () => { render(<MainRecorderPanel {...baseProps} />) })
    expect(screen.getByDisplayValue('Test 1')).toBeInTheDocument()
    expect(screen.getByDisplayValue('https://example.com')).toBeInTheDocument()
  })

  it('New Test button is disabled when no active suite', async () => {
    await act(async () => {
      render(<MainRecorderPanel {...baseProps} activeSuiteId={null} />)
    })
    const newTestBtn = screen.getByText('recorder.mainRecorderPanel.newTest')
    expect(newTestBtn.closest('button')).toBeDisabled()
  })

  it('Record button is disabled when already recording', async () => {
    await act(async () => {
      render(<MainRecorderPanel {...baseProps} isRecording={true} />)
    })
    expect(screen.getByText('recorder.mainRecorderPanel.record').closest('button')).toBeDisabled()
  })

  it('Stop button is disabled when not recording', async () => {
    await act(async () => { render(<MainRecorderPanel {...baseProps} />) })
    expect(screen.getByText('recorder.mainRecorderPanel.stop').closest('button')).toBeDisabled()
  })

  it('Stop button is enabled when recording', async () => {
    await act(async () => {
      render(<MainRecorderPanel {...baseProps} isRecording={true} />)
    })
    expect(screen.getByText('recorder.mainRecorderPanel.stop').closest('button')).not.toBeDisabled()
  })

  it('Run button is disabled when recording', async () => {
    await act(async () => {
      render(<MainRecorderPanel {...baseProps} isRecording={true} />)
    })
    expect(screen.getByText('recorder.mainRecorderPanel.run').closest('button')).toBeDisabled()
  })
})
