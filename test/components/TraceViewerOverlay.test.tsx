import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import toast from 'react-hot-toast'
import TraceViewerOverlay from '@components/TraceViewerOverlay'
import OpenTraceButtons from '@components/OpenTraceButtons'
import { useTraceStore } from '@foundation/Stores/traceStore'
import type { RaiderTraceIndex, TraceOpenResult } from '@shared/types/raiderTrace'
import { fixtureIndex } from '../helpers/traceFixture'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key} ${JSON.stringify(values)}` : key
  })
}))

vi.mock('react-hot-toast', () => ({ default: { error: vi.fn() } }))

let index: RaiderTraceIndex
let menuOpened: (result: TraceOpenResult) => void
const unsubscribe = vi.fn()

const ok = (traceId: string): TraceOpenResult => ({ ok: true, traceId, index })

beforeEach(() => {
  vi.mocked(toast.error).mockClear()
  unsubscribe.mockClear()
  index = fixtureIndex()
  useTraceStore.setState({ current: null, opener: null })
  window.api = {
    openTrace: vi.fn(),
    openDroppedTrace: vi.fn(),
    readTraceEntry: vi.fn().mockResolvedValue({ ok: false, error: 'notCaptured' }),
    readImage: vi.fn(),
    closeTrace: vi.fn().mockResolvedValue(undefined),
    onTraceOpened: vi.fn((callback: (result: TraceOpenResult) => void) => {
      menuOpened = callback
      return unsubscribe
    })
  } as unknown as typeof window.api
})

const viewer = (): HTMLElement | null => screen.queryByTestId('trace-viewer')

// jsdom has no DataTransfer, so the event carries a stand-in.
const dragEvent = (type: 'drop' | 'dragover', files: File[], types = ['Files']): Event => {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', { value: { types, files } })
  return event
}

const drop = async (files: File[]): Promise<Event> => {
  const event = dragEvent('drop', files)
  await act(async () => {
    window.dispatchEvent(event)
  })
  return event
}

const zip = (name = 'trace.zip'): File => new File(['x'], name, { type: 'application/zip' })

describe('TraceViewerOverlay', () => {
  it('renders nothing while no trace is open', () => {
    const { container } = render(<TraceViewerOverlay />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a trace opened from the menu, and says why one failed', () => {
    render(<TraceViewerOverlay />)
    act(() => menuOpened(ok('t1')))
    expect(viewer()).toBeInTheDocument()
    expect(viewer()).toHaveAttribute('role', 'dialog')
    act(() => menuOpened({ ok: false, error: 'newerVersion' }))
    expect(toast.error).toHaveBeenCalledWith('traceViewer.error.newerVersion')
  })

  it('stops listening to the menu when unmounted', () => {
    const { unmount } = render(<TraceViewerOverlay />)
    unmount()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it.each(['unsafe', 'notFound', 'tooLarge', 'notTrace', 'damaged'] as const)(
    'has a message for %s',
    (error) => {
      render(<TraceViewerOverlay />)
      act(() => menuOpened({ ok: false, error }))
      expect(toast.error).toHaveBeenCalledWith(`traceViewer.error.${error}`)
      expect(viewer()).not.toBeInTheDocument()
    }
  )

  it('opens one dropped file through preload', async () => {
    vi.mocked(window.api.openDroppedTrace).mockResolvedValue(ok('t1'))
    render(<TraceViewerOverlay />)
    const file = zip()
    const event = await drop([file])
    expect(event.defaultPrevented).toBe(true)
    expect(window.api.openDroppedTrace).toHaveBeenCalledWith(file)
    expect(viewer()).toBeInTheDocument()
  })

  it('ignores a drop of two files or none, but keeps the window where it is', async () => {
    render(<TraceViewerOverlay />)
    expect((await drop([zip('a.zip'), zip('b.zip')])).defaultPrevented).toBe(true)
    expect((await drop([])).defaultPrevented).toBe(true)
    expect(window.api.openDroppedTrace).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('traceViewer.error.dropOne')
  })

  it('says a dropped PDF or folder is not a trace, without opening it', async () => {
    render(<TraceViewerOverlay />)
    await drop([new File(['%PDF'], 'report.pdf', { type: 'application/pdf' })])
    await drop([new File([], 'screenshots')])
    expect(window.api.openDroppedTrace).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledTimes(2)
    expect(toast.error).toHaveBeenNthCalledWith(1, 'traceViewer.error.notTrace')
    expect(toast.error).toHaveBeenNthCalledWith(2, 'traceViewer.error.notTrace')
  })

  it('leaves drags of anything but files alone', () => {
    render(<TraceViewerOverlay />)
    const event = dragEvent('dragover', [], ['text/plain'])
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    const files = dragEvent('dragover', [])
    window.dispatchEvent(files)
    expect(files.defaultPrevented).toBe(true)
  })

  it('reopens the same trace dropped twice, keeping only the newer one open', async () => {
    vi.mocked(window.api.openDroppedTrace)
      .mockResolvedValueOnce(ok('t1'))
      .mockResolvedValueOnce(ok('t2'))
    render(<TraceViewerOverlay />)
    await drop([zip()])
    await drop([zip()])
    expect(window.api.closeTrace).toHaveBeenCalledTimes(1)
    expect(window.api.closeTrace).toHaveBeenCalledWith('t1')
    expect(useTraceStore.getState().current?.traceId).toBe('t2')
  })

  it('removes its drop listeners when unmounted', async () => {
    const { unmount } = render(<TraceViewerOverlay />)
    unmount()
    const event = await drop([zip()])
    expect(event.defaultPrevented).toBe(false)
    expect(window.api.openDroppedTrace).not.toHaveBeenCalled()
  })

  it('closes the shown trace before showing another, but not the same one', () => {
    render(<TraceViewerOverlay />)
    act(() => menuOpened(ok('t1')))
    act(() => menuOpened(ok('t1')))
    expect(window.api.closeTrace).not.toHaveBeenCalled()
    act(() => menuOpened(ok('t2')))
    expect(window.api.closeTrace).toHaveBeenCalledWith('t1')
    expect(window.api.closeTrace).toHaveBeenCalledTimes(1)
  })

  it('closes the trace with Close trace', () => {
    render(<TraceViewerOverlay />)
    act(() => menuOpened(ok('t1')))
    fireEvent.click(screen.getByRole('button', { name: 'traceViewer.close' }))
    expect(window.api.closeTrace).toHaveBeenCalledWith('t1')
    expect(viewer()).not.toBeInTheDocument()
  })

  it('closes the trace with Escape', () => {
    render(<TraceViewerOverlay />)
    act(() => menuOpened(ok('t1')))
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    expect(window.api.closeTrace).toHaveBeenCalledWith('t1')
    expect(viewer()).not.toBeInTheDocument()
  })

  it('closes the trace when unmounted', () => {
    const { unmount } = render(<TraceViewerOverlay />)
    act(() => menuOpened(ok('t1')))
    unmount()
    expect(window.api.closeTrace).toHaveBeenCalledWith('t1')
    expect(useTraceStore.getState().current).toBeNull()
  })

  it('says a failed open was damaged and shows nothing', async () => {
    vi.mocked(window.api.openTrace).mockRejectedValue(new Error('ipc'))
    vi.mocked(window.api.openDroppedTrace).mockRejectedValue(new Error('ipc'))
    render(
      <>
        <OpenTraceButtons traces={[{ path: '/p/raider-results/attachments/0-trace.zip' }]} />
        <TraceViewerOverlay />
      </>
    )
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'traceViewer.open' }))
    })
    await drop([zip()])
    expect(toast.error).toHaveBeenCalledTimes(2)
    expect(toast.error).toHaveBeenCalledWith('traceViewer.error.damaged')
    expect(viewer()).not.toBeInTheDocument()
  })

  it('keeps focus inside and gives it back to the opener', async () => {
    vi.mocked(window.api.openTrace).mockResolvedValue(ok('t1'))
    render(
      <>
        <OpenTraceButtons traces={[{ path: '/p/raider-results/attachments/0-trace.zip' }]} />
        <TraceViewerOverlay />
      </>
    )
    const opener = screen.getByRole('button', { name: 'traceViewer.open' })
    opener.focus()
    await act(async () => {
      fireEvent.click(opener)
    })
    const close = screen.getByRole('button', { name: 'traceViewer.close' })
    await waitFor(() => expect(close).toHaveFocus())

    // Shift+Tab from the first stop wraps to the last, and Tab from the last back to the first.
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })
    const last = document.activeElement as HTMLElement
    expect(viewer()).toContainElement(last)
    expect(last).not.toBe(close)
    fireEvent.keyDown(last, { key: 'Tab' })
    expect(close).toHaveFocus()

    // Focus that lands outside is pulled back in.
    act(() => opener.focus())
    expect(viewer()).toContainElement(document.activeElement as HTMLElement)

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(opener).toHaveFocus()
  })
})
