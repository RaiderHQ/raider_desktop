import { render, screen, act, fireEvent } from '@testing-library/react'
import MainRecorderPanel from '@components/MainRecorderPanel'
import '@testing-library/jest-dom'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: object) => opts ? `${key} ${JSON.stringify(opts)}` : key })
}))

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn(), loading: vi.fn() }, Toaster: () => null }))

const storeState = {
  activeTest: { id: 't1', name: 'Test 1', url: 'https://example.com', steps: [] } as { id: string; name: string; url: string; steps: string[] } | null,
  isRecording: false,
  isRunning: false,
  activeSuiteId: 'suite-1' as string | null,
  activeSuite: () => ({ id: 'suite-1', name: 'My Suite', tests: [] }) as { id: string; name: string; tests: unknown[] } | undefined,
  setActiveTest: vi.fn(),
  updateActiveTest: vi.fn()
}

vi.mock('@foundation/Stores/recorderStore', () => {
  const useRecorderStore = (selector?: (s: typeof storeState) => unknown) =>
    selector ? selector(storeState) : storeState
  useRecorderStore.getState = () => storeState
  return { default: useRecorderStore }
})

const baseProps = {
  onStartRecording: vi.fn(),
  onRunTest: vi.fn(),
  onStopRecording: vi.fn()
}

beforeEach(() => {
  storeState.activeTest = { id: 't1', name: 'Test 1', url: 'https://example.com', steps: [] }
  storeState.isRecording = false
  storeState.isRunning = false
  storeState.activeSuiteId = 'suite-1'
  storeState.activeSuite = () => ({ id: 'suite-1', name: 'My Suite', tests: [] })
})

describe('MainRecorderPanel', () => {
  it('renders the suite name', async () => {
    await act(async () => { render(<MainRecorderPanel {...baseProps} />) })
    expect(screen.getByText(/My Suite/)).toBeInTheDocument()
  })

  it('shows simplified toolbar when no active suite', async () => {
    storeState.activeSuite = () => undefined
    storeState.activeSuiteId = null
    await act(async () => {
      render(<MainRecorderPanel {...baseProps} />)
    })
    expect(screen.getByText('recorder.mainRecorderPanel.noSuite')).toBeInTheDocument()
    expect(screen.getByText('recorder.mainRecorderPanel.emptyHelper')).toBeInTheDocument()
    // Inputs and action buttons should not be rendered
    expect(screen.queryByText('recorder.mainRecorderPanel.newTest')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('recorder.mainRecorderPanel.record')).not.toBeInTheDocument()
  })

  it('renders test name and URL inputs', async () => {
    await act(async () => { render(<MainRecorderPanel {...baseProps} />) })
    expect(screen.getByDisplayValue('Test 1')).toBeInTheDocument()
    expect(screen.getByDisplayValue('https://example.com')).toBeInTheDocument()
  })

  it('Record button is disabled when already recording', async () => {
    storeState.isRecording = true
    await act(async () => {
      render(<MainRecorderPanel {...baseProps} />)
    })
    expect(screen.getByLabelText('recorder.mainRecorderPanel.record')).toBeDisabled()
  })

  it('Stop button is disabled when not recording', async () => {
    await act(async () => { render(<MainRecorderPanel {...baseProps} />) })
    expect(screen.getByLabelText('recorder.mainRecorderPanel.stop')).toBeDisabled()
  })

  it('Stop button is enabled when recording', async () => {
    storeState.isRecording = true
    await act(async () => {
      render(<MainRecorderPanel {...baseProps} />)
    })
    expect(screen.getByLabelText('recorder.mainRecorderPanel.stop')).not.toBeDisabled()
  })

  it('Run button is disabled when recording', async () => {
    storeState.isRecording = true
    await act(async () => {
      render(<MainRecorderPanel {...baseProps} />)
    })
    expect(screen.getByLabelText('recorder.mainRecorderPanel.run')).toBeDisabled()
  })

  describe('readOnly', () => {
    it('hides record, stop and new test but keeps run', async () => {
      await act(async () => {
        render(<MainRecorderPanel {...baseProps} readOnly />)
      })
      expect(screen.queryByLabelText('recorder.mainRecorderPanel.record')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('recorder.mainRecorderPanel.stop')).not.toBeInTheDocument()
      expect(screen.queryByText('recorder.mainRecorderPanel.newTest')).not.toBeInTheDocument()
      expect(screen.getByLabelText('recorder.mainRecorderPanel.run')).not.toBeDisabled()
    })

    it('shows the title instead of editable fields', async () => {
      await act(async () => {
        render(<MainRecorderPanel {...baseProps} readOnly readOnlyTitle="Checkout flow" />)
      })
      expect(screen.getByText('Checkout flow')).toBeInTheDocument()
      expect(screen.queryByDisplayValue('Test 1')).not.toBeInTheDocument()
    })
  })

  describe('test name saving', () => {
    it('saves the renamed test straight away on blur', async () => {
      const saveRecording = vi.fn().mockResolvedValue({ success: true })
      // @ts-expect-error - Mocking window.api
      window.api = { saveRecording }
      await act(async () => {
        render(<MainRecorderPanel {...baseProps} />)
      })
      const input = screen.getByDisplayValue('Test 1')
      fireEvent.change(input, { target: { value: 'Checkout' } })
      fireEvent.blur(input)
      expect(saveRecording).toHaveBeenCalledWith(
        'suite-1',
        expect.objectContaining({ id: 't1', name: 'Checkout' })
      )
    })

    it('copes with a save that returns nothing', async () => {
      // @ts-expect-error - Mocking window.api
      window.api = { saveRecording: vi.fn() }
      await act(async () => {
        render(<MainRecorderPanel {...baseProps} />)
      })
      fireEvent.click(screen.getByText('recorder.mainRecorderPanel.newTest'))
    })

    it('hides More (import/export) when read-only', async () => {
      await act(async () => {
        render(<MainRecorderPanel {...baseProps} readOnly />)
      })
      expect(screen.queryByText('recorder.mainRecorderPanel.more')).not.toBeInTheDocument()
    })
  })

  describe('test name', () => {
    it('is saved on blur, not on every keystroke', async () => {
      storeState.updateActiveTest.mockClear()
      await act(async () => {
        render(<MainRecorderPanel {...baseProps} />)
      })
      const input = screen.getByDisplayValue('Test 1')
      fireEvent.change(input, { target: { value: 'Checkout fl' } })
      expect(storeState.updateActiveTest).not.toHaveBeenCalled()
      fireEvent.blur(input)
      expect(storeState.updateActiveTest).toHaveBeenCalledTimes(1)
    })

    it('is saved on Enter', async () => {
      storeState.updateActiveTest.mockClear()
      await act(async () => {
        render(<MainRecorderPanel {...baseProps} />)
      })
      const input = screen.getByDisplayValue('Test 1')
      fireEvent.change(input, { target: { value: 'Checkout' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(storeState.updateActiveTest).toHaveBeenCalledTimes(1)
    })
  })

  it('disables Record when recording is not supported', async () => {
    await act(async () => {
      render(<MainRecorderPanel {...baseProps} recordingDisabled />)
    })
    expect(screen.getByLabelText('recorder.mainRecorderPanel.record')).toBeDisabled()
  })
})
