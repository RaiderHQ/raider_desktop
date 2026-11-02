import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import toast from 'react-hot-toast'
import SavedTraceViewer from '@components/SavedTraceViewer'
import type { RaiderTraceIndex } from '@shared/types/raiderTrace'
import { fixtureIndex } from '../helpers/traceFixture'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key} ${JSON.stringify(values)}` : key
  })
}))

vi.mock('react-hot-toast', () => ({ default: { error: vi.fn() } }))

let index: RaiderTraceIndex

beforeEach(() => {
  vi.mocked(toast.error).mockClear()
  index = fixtureIndex()
  window.api = {
    readTraceEntry: vi.fn(async (_id: string, name: string) =>
      name.endsWith('.html')
        ? { ok: true, kind: 'html', text: '<html><head></head><body></body></html>' }
        : { ok: true, kind: 'image', dataUrl: `data:image/jpeg;base64,${name}` }
    ),
    readImage: vi.fn()
  } as unknown as typeof window.api
})

const show = (onClose = vi.fn(), from: RaiderTraceIndex = index) =>
  render(<SavedTraceViewer traceId="t1" index={from} onClose={onClose} />)

const tab = (name: string): HTMLElement =>
  screen.getByRole('tab', { name: `traceViewer.tabs.${name}` })

const panel = (): HTMLElement => screen.getByRole('tabpanel')

describe('SavedTraceViewer', () => {
  it('names the test, its attempt and the browser', () => {
    show()
    expect(
      screen.getByRole('heading', { level: 2, name: 'Trace replay fails after driving the page' })
    ).toBeInTheDocument()
    expect(screen.getByText('traceViewer.attempt {"attempt":1}')).toBeInTheDocument()
    expect(screen.getByText('chrome 156.0.8078.74')).toBeInTheDocument()
  })

  it('selects step 9, the failed one, at first', () => {
    const { container } = show()
    expect(container.querySelector('[data-step-id="step-9"]')).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(tab('step')).toHaveAttribute('aria-selected', 'true')
  })

  it('filters network to the step, with a toggle for all', () => {
    show()
    fireEvent.click(tab('network'))
    expect(tab('network')).toHaveAttribute('aria-selected', 'true')
    expect(within(panel()).getByText('traceViewer.network.empty')).toBeInTheDocument()
    fireEvent.click(within(panel()).getByRole('checkbox', { name: 'traceViewer.showAll' }))
    expect(within(panel()).getAllByRole('listitem')).toHaveLength(3)
  })

  it('keeps one show-all per tab', () => {
    show()
    fireEvent.click(tab('network'))
    fireEvent.click(within(panel()).getByRole('checkbox', { name: 'traceViewer.showAll' }))
    fireEvent.click(tab('console'))
    expect(within(panel()).getByRole('checkbox', { name: 'traceViewer.showAll' })).not.toBeChecked()
    expect(within(panel()).getByText('traceViewer.console.empty')).toBeInTheDocument()
  })

  it('shows the console message of step 6 once it is selected', () => {
    const { container } = show()
    fireEvent.click(container.querySelector('[data-step-id="step-6"]')!)
    fireEvent.click(tab('console'))
    expect(within(panel()).getByText('trace e2e error')).toBeInTheDocument()
  })

  it('says what the producer removed, and nothing when it removed nothing', () => {
    const { unmount } = show()
    expect(screen.queryByText(/traceViewer\.truncated/)).not.toBeInTheDocument()
    unmount()
    show(vi.fn(), { ...index, truncated: { ...index.truncated, screenshots: 2 } })
    expect(screen.getByText('traceViewer.truncated.screenshots')).toBeInTheDocument()
    expect(screen.queryByText('traceViewer.truncated.steps')).not.toBeInTheDocument()
  })

  it('says the console was not available in this browser', () => {
    show(vi.fn(), { ...index, capabilities: { ...index.capabilities, console: false } })
    fireEvent.click(tab('console'))
    expect(within(panel()).getByText('traceViewer.unavailable')).toBeInTheDocument()
  })

  it('reads entries of its own trace', async () => {
    show()
    await waitFor(() => expect(window.api.readTraceEntry).toHaveBeenCalled())
    for (const [id] of vi.mocked(window.api.readTraceEntry).mock.calls) expect(id).toBe('t1')
  })

  it('says once when the trace was replaced by a newer copy', async () => {
    vi.mocked(window.api.readTraceEntry).mockResolvedValue({ ok: false, error: 'closed' })
    const { container } = show()
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('traceViewer.error.closed'))
    const before = vi.mocked(window.api.readTraceEntry).mock.calls.length
    fireEvent.click(container.querySelector('[data-step-id="step-6"]')!)
    await waitFor(() =>
      expect(vi.mocked(window.api.readTraceEntry).mock.calls.length).toBeGreaterThan(before)
    )
    await Promise.resolve()
    expect(toast.error).toHaveBeenCalledTimes(1)
  })

  it('closes with Close trace', () => {
    const onClose = vi.fn()
    show(onClose)
    fireEvent.click(screen.getByRole('button', { name: 'traceViewer.close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
