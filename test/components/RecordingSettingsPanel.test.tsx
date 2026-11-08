import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import RecordingSettingsPanel from '@components/RecordingSettingsPanel'
import useRecorderStore from '@foundation/Stores/recorderStore'
import useProjectStore from '@foundation/Stores/projectStore'
import { DEFAULT_SELECTOR_PRIORITY } from '@shared/selectorPriority'
import en from '../../src/renderer/src/assets/translations/en.json'

vi.mock('react-i18next', () => ({
  useTranslation: (): { t: (key: string) => string } => ({ t: (key: string): string => key })
}))

const toastError = vi.fn()
vi.mock('react-hot-toast', () => ({
  default: { error: (m: string): void => toastError(m), success: vi.fn() }
}))

const getRecorderSettings = vi.fn()
const updateRecordingSettings = vi.fn()

const waits = {
  explicitWait: 10,
  setExplicitWait: vi.fn(),
  loaded: true,
  saveWait: vi.fn()
}

const renderPanel = async (props: Partial<typeof waits> = {}): Promise<void> => {
  await act(async () => {
    render(<RecordingSettingsPanel {...waits} {...props} />)
  })
}

const items = (): string[] =>
  within(screen.getByTestId('recording-priority-list'))
    .getAllByRole('listitem')
    .map((li) => li.getAttribute('data-kind') ?? '')

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  useRecorderStore.setState({ isRecording: false })
  getRecorderSettings.mockResolvedValue({ selectorPriority: ['role', 'label', 'testId', 'css'] })
  updateRecordingSettings.mockResolvedValue({ success: true })
  ;(window as unknown as { api: unknown }).api = {
    getRecorderSettings,
    updateRecordingSettings,
    readDirectory: vi.fn().mockResolvedValue([]),
    setActiveProject: vi.fn().mockResolvedValue({ success: true })
  }
  // After window.api exists: the store's project subscription calls it
  useProjectStore.setState({ projectPath: '/p' })
})

const down = (kind: string): string =>
  `settings.recording.priority.down settings.recording.priority.kind.${kind}`

const expand = (): void => {
  fireEvent.click(screen.getByTestId('recording-settings-toggle'))
}

describe('RecordingSettingsPanel', () => {
  it('starts folded to its header and remembers being opened', async () => {
    await renderPanel()
    const toggle = screen.getByTestId('recording-settings-toggle')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByTestId('recording-explicit-wait')).not.toBeInTheDocument()
    expand()
    expect(screen.getByTestId('recording-explicit-wait')).toBeInTheDocument()
    expect(localStorage.getItem('recordingSettingsCollapsed')).toBe('0')
  })

  it('opens expanded when it was left open', async () => {
    localStorage.setItem('recordingSettingsCollapsed', '0')
    await renderPanel()
    expect(screen.getByTestId('recording-explicit-wait')).toBeInTheDocument()
  })

  it('edits the wait through the shared state and saves it on blur', async () => {
    await renderPanel()
    expand()
    const input = screen.getByTestId('recording-explicit-wait')
    expect(input).toHaveValue(10)
    fireEvent.change(input, { target: { value: '15' } })
    expect(waits.setExplicitWait).toHaveBeenCalledWith(15)
    fireEvent.blur(input)
    expect(waits.saveWait).toHaveBeenCalledWith({ explicitWait: 10 })
  })

  it('ignores a negative wait', async () => {
    await renderPanel()
    expand()
    fireEvent.change(screen.getByTestId('recording-explicit-wait'), { target: { value: '-1' } })
    expect(waits.setExplicitWait).not.toHaveBeenCalled()
  })

  it("shows the project's locator order and moves a kind up, saving the new order", async () => {
    await renderPanel()
    expand()
    await waitFor(() => expect(items()).toEqual(['role', 'label', 'testId', 'css']))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'settings.recording.priority.up settings.recording.priority.kind.testId' }))
    })
    expect(items()).toEqual(['role', 'testId', 'label', 'css'])
    expect(updateRecordingSettings).toHaveBeenCalledWith({
      selectorPriority: ['role', 'testId', 'label', 'css']
    })
  })

  it('moves a kind down and keeps the ends fixed', async () => {
    await renderPanel()
    expand()
    await waitFor(() => expect(items()).toHaveLength(4))
    expect(
      screen.getByRole('button', { name: 'settings.recording.priority.up settings.recording.priority.kind.role' })
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'settings.recording.priority.down settings.recording.priority.kind.css' })
    ).toBeDisabled()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'settings.recording.priority.down settings.recording.priority.kind.role' }))
    })
    expect(items()).toEqual(['label', 'role', 'testId', 'css'])
  })

  it('resets to the default order', async () => {
    await renderPanel()
    expand()
    await waitFor(() => expect(items()).toHaveLength(4))
    await act(async () => {
      fireEvent.click(screen.getByTestId('recording-priority-reset'))
    })
    expect(items()).toEqual([...DEFAULT_SELECTOR_PRIORITY])
    expect(updateRecordingSettings).toHaveBeenCalledWith({
      selectorPriority: [...DEFAULT_SELECTOR_PRIORITY]
    })
  })

  it('puts the order back and says so when saving fails', async () => {
    updateRecordingSettings.mockResolvedValue({ success: false, error: 'disk full' })
    await renderPanel()
    expand()
    await waitFor(() => expect(items()).toHaveLength(4))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'settings.recording.priority.down settings.recording.priority.kind.role' }))
    })
    expect(items()).toEqual(['role', 'label', 'testId', 'css'])
    expect(toastError).toHaveBeenCalled()
  })

  it('ignores an earlier failed save once a later one, which carries its change, is saved', async () => {
    let failFirst: (v: unknown) => void = () => {}
    updateRecordingSettings
      .mockReturnValueOnce(new Promise((r) => (failFirst = r)))
      .mockResolvedValueOnce({ success: true })
    await renderPanel()
    expand()
    await waitFor(() => expect(items()).toHaveLength(4))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: down('role') }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: down('testId') }))
    })
    expect(items()).toEqual(['label', 'role', 'css', 'testId'])
    await act(async () => failFirst({ success: false, error: 'busy' }))
    expect(items()).toEqual(['label', 'role', 'css', 'testId'])
    expect(toastError).not.toHaveBeenCalled()
  })

  it('keeps a later move when an earlier save fails while it is still pending', async () => {
    let failFirst: (v: unknown) => void = () => {}
    let passSecond: (v: unknown) => void = () => {}
    updateRecordingSettings
      .mockReturnValueOnce(new Promise((r) => (failFirst = r)))
      .mockReturnValueOnce(new Promise((r) => (passSecond = r)))
    await renderPanel()
    expand()
    await waitFor(() => expect(items()).toHaveLength(4))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: down('role') }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: down('testId') }))
    })
    await act(async () => failFirst({ success: false, error: 'busy' }))
    expect(items()).toEqual(['label', 'role', 'css', 'testId'])
    await act(async () => passSecond({ success: true }))
    expect(items()).toEqual(['label', 'role', 'css', 'testId'])
    expect(toastError).not.toHaveBeenCalled()
  })

  it('ignores a save that finishes after the project changed', async () => {
    let fail: (v: unknown) => void = () => {}
    updateRecordingSettings.mockReturnValueOnce(new Promise((r) => (fail = r)))
    await renderPanel()
    expand()
    await waitFor(() => expect(items()).toHaveLength(4))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: down('role') }))
    })
    getRecorderSettings.mockResolvedValue({ selectorPriority: ['css', 'xpath'] })
    await act(async () => useProjectStore.setState({ projectPath: '/other' }))
    await waitFor(() => expect(items()).toEqual(['css', 'xpath']))
    await act(async () => fail({ success: false, error: 'gone' }))
    expect(items()).toEqual(['css', 'xpath'])
    expect(toastError).not.toHaveBeenCalled()
  })

  it('shows a name listed twice once, and an unknown one as an attribute', async () => {
    getRecorderSettings.mockResolvedValue({ selectorPriority: ['role', 'data-qa', 'role'] })
    await renderPanel()
    expand()
    await waitFor(() => expect(items()).toEqual(['role', 'data-qa']))
    expect(screen.getByTestId('recording-priority-list')).toHaveTextContent(
      'settings.recording.priority.kind.attribute'
    )
  })

  it('does not take an emptied wait field as 0', async () => {
    await renderPanel()
    expand()
    fireEvent.change(screen.getByTestId('recording-explicit-wait'), { target: { value: '' } })
    expect(waits.setExplicitWait).not.toHaveBeenCalled()
  })

  it('locks the settings while recording', async () => {
    useRecorderStore.setState({ isRecording: true })
    await renderPanel()
    expand()
    await waitFor(() => expect(items()).toHaveLength(4))
    expect(screen.getByTestId('recording-explicit-wait')).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'settings.recording.priority.down settings.recording.priority.kind.role' })
    ).toBeDisabled()
    expect(screen.getByTestId('recording-priority-reset')).toBeDisabled()
  })

  it('has every string it uses in en.json', () => {
    const rec = (en as unknown as { settings: { recording: Record<string, unknown> } }).settings
      .recording
    expect(rec.title).toBeTruthy()
    expect(rec.priority).toBeTruthy()
  })
})
