import { render, screen, fireEvent, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import OpenTraceButtons from '@components/OpenTraceButtons'
import { useTraceStore } from '@foundation/Stores/traceStore'
import { fixtureIndex } from '../helpers/traceFixture'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key} ${JSON.stringify(values)}` : key
  })
}))

vi.mock('react-hot-toast', () => ({ default: { error: vi.fn() } }))

const PATH = '/p/raider-results/attachments/0-trace.zip'

beforeEach(() => {
  useTraceStore.setState({ current: null, opener: null, opening: false })
  window.api = {
    openTrace: vi.fn(),
    closeTrace: vi.fn().mockResolvedValue(undefined)
  } as unknown as typeof window.api
})

const labels = (): string[] => screen.getAllByRole('button').map((b) => b.textContent ?? '')

describe('OpenTraceButtons', () => {
  it.each([[{ path: PATH }], [{ path: PATH, attempt: 1 }]])('offers one Open trace for %o', (trace) => {
    render(<OpenTraceButtons traces={[trace]} />)
    expect(labels()).toEqual(['traceViewer.open'])
  })

  it('offers one button per attempt, latest first', () => {
    render(
      <OpenTraceButtons
        traces={[
          { path: '/p/a2.zip', attempt: 2 },
          { path: '/p/a1.zip', attempt: 1 }
        ]}
      />
    )
    expect(labels()).toEqual([
      'traceViewer.openAttempt {"attempt":"2"}',
      'traceViewer.openAttempt {"attempt":"1"}'
    ])
  })

  it('numbers several traces without attempts', () => {
    render(<OpenTraceButtons traces={[{ path: '/p/a.zip' }, { path: '/p/b.zip' }]} />)
    expect(labels()).toEqual([
      'traceViewer.openNumbered {"n":"1"}',
      'traceViewer.openNumbered {"n":"2"}'
    ])
  })

  it('opens the result trace, disabled while opening, then shows it', async () => {
    let resolve!: (value: unknown) => void
    vi.mocked(window.api.openTrace).mockReturnValue(
      new Promise((r) => {
        resolve = r
      }) as never
    )
    render(<OpenTraceButtons traces={[{ path: PATH }]} />)
    const button = screen.getByRole('button')
    fireEvent.click(button)
    expect(window.api.openTrace).toHaveBeenCalledWith({ kind: 'result', path: PATH })
    expect(button).toBeDisabled()
    expect(button).toHaveTextContent('traceViewer.opening')
    fireEvent.click(button)
    expect(window.api.openTrace).toHaveBeenCalledTimes(1)
    const index = fixtureIndex()
    await act(async () => resolve({ ok: true, traceId: 't1', index }))
    expect(button).not.toBeDisabled()
    expect(useTraceStore.getState().current).toEqual({ traceId: 't1', index })
  })

  it('does not open the card when clicked', () => {
    vi.mocked(window.api.openTrace).mockResolvedValue({ ok: false, error: 'notFound' })
    const onCard = vi.fn()
    render(
      <div onClick={onCard}>
        <OpenTraceButtons traces={[{ path: PATH }]} />
      </div>
    )
    fireEvent.click(screen.getByRole('button'))
    expect(onCard).not.toHaveBeenCalled()
  })

  it("disables every card's Open trace while one open runs", async () => {
    let resolve!: (value: unknown) => void
    vi.mocked(window.api.openTrace).mockReturnValue(
      new Promise((r) => {
        resolve = r
      }) as never
    )
    render(
      <>
        <OpenTraceButtons traces={[{ path: '/p/a.zip' }]} />
        <OpenTraceButtons traces={[{ path: '/p/b.zip' }]} />
      </>
    )
    const [first, second] = screen.getAllByRole('button')
    fireEvent.click(first)
    expect(second).toBeDisabled()
    expect(second).toHaveTextContent('traceViewer.open')
    fireEvent.click(second)
    expect(window.api.openTrace).toHaveBeenCalledTimes(1)
    await act(async () => resolve({ ok: false, error: 'notFound' }))
    expect(second).not.toBeDisabled()
  })
})
