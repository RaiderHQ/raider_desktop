import { render, screen, fireEvent, act, within } from '@testing-library/react'
import TraceTimeline from '@components/TraceTimeline'
import '@testing-library/jest-dom'
import { fromRaiderTrace } from '@foundation/trace/viewModel'
import { fixtureIndex } from '../helpers/traceFixture'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key}${JSON.stringify(values)}` : key
  })
}))

type IOCallback = (entries: Partial<IntersectionObserverEntry>[]) => void
let observers: { callback: IOCallback; targets: Element[] }[] = []

class FakeIntersectionObserver {
  entry: { callback: IOCallback; targets: Element[] }
  constructor(callback: IOCallback) {
    this.entry = { callback, targets: [] }
    observers.push(this.entry)
  }
  observe(target: Element): void {
    this.entry.targets.push(target)
  }
  unobserve(): void {}
  disconnect(): void {}
}

const intersect = (target: Element): void => {
  for (const o of observers) {
    if (o.targets.includes(target)) {
      act(() => o.callback([{ target, isIntersecting: true }]))
    }
  }
}

const read = vi.fn()
const rowOf = (n: number): HTMLElement => document.querySelector(`[data-step-id="step-${n}"]`)!

const setup = (onSelectStep = vi.fn(), selectedStepId: string | null = null) => {
  const view = fromRaiderTrace(fixtureIndex(), read)
  return {
    onSelectStep,
    ...render(
      <TraceTimeline
        viewSteps={view.steps}
        selectedStepId={selectedStepId}
        onSelectStep={onSelectStep}
      />
    )
  }
}

beforeEach(() => {
  observers = []
  read.mockReset()
  read.mockResolvedValue({ ok: true, kind: 'image', dataUrl: 'data:image/jpeg;base64,AAAA' })
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('TraceTimeline with a saved trace', () => {
  it('shows plain titles', () => {
    const { container } = setup()
    expect(rowOf(2).textContent).toContain('traceViewer.step.typeSecret')
    expect(container.textContent).not.toContain('send_keys')
    expect(container.textContent).not.toContain('pw')
  })

  it('marks failed rows', () => {
    setup()
    expect(rowOf(9)).toHaveAttribute('data-status', 'failed')
    expect(rowOf(9).className).toContain('border-status-err')
  })

  it('shows waited time', () => {
    setup()
    expect(rowOf(6).textContent).toContain('traceViewer.waited')
    expect(rowOf(6).textContent).toContain('"seconds":"0.1"')
  })

  it('collapses groups', () => {
    const { onSelectStep } = setup()
    expect(rowOf(10)).toBeInTheDocument()
    // Steps 7 and 9 are groups; the second toggle belongs to step 9.
    const toggle = screen.getAllByRole('button', { name: 'traceViewer.collapseGroup' })[1]
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(rowOf(10)).toBeNull()
    expect(onSelectStep).not.toHaveBeenCalled()
  })

  it('selects a group row without collapsing it', () => {
    const { onSelectStep } = setup()
    fireEvent.click(rowOf(9))
    expect(onSelectStep).toHaveBeenCalledWith('step-9')
    expect(rowOf(10)).toBeInTheDocument()
  })

  it('loads thumbnails only for visible rows', async () => {
    setup()
    expect(read).not.toHaveBeenCalled()
    intersect(rowOf(2))
    await act(async () => {})
    expect(read).toHaveBeenCalledTimes(1)
    expect(read).toHaveBeenCalledWith('steps/0002.jpg')
    expect(within(rowOf(2)).getByRole('img')).toHaveAttribute('src', 'data:image/jpeg;base64,AAAA')
    expect(within(rowOf(3)).queryByRole('img')).toBeNull()
  })

  it('puts a late thumbnail only on its own row', async () => {
    let resolve2: (v: unknown) => void = () => {}
    read.mockImplementation((name: string) =>
      name === 'steps/0002.jpg'
        ? new Promise((r) => (resolve2 = r))
        : Promise.resolve({ ok: true, kind: 'image', dataUrl: 'data:image/jpeg;base64,BBBB' })
    )
    setup()
    intersect(rowOf(2))
    intersect(rowOf(3))
    await act(async () => {})
    expect(within(rowOf(3)).getByRole('img')).toHaveAttribute('src', 'data:image/jpeg;base64,BBBB')
    expect(within(rowOf(2)).queryByRole('img')).toBeNull()
    await act(async () => resolve2({ ok: true, kind: 'image', dataUrl: 'data:image/jpeg;base64,AAAA' }))
    expect(within(rowOf(2)).getByRole('img')).toHaveAttribute('src', 'data:image/jpeg;base64,AAAA')
    expect(within(rowOf(3)).getByRole('img')).toHaveAttribute('src', 'data:image/jpeg;base64,BBBB')
  })

  it('does not auto-scroll', () => {
    const spy = vi.fn()
    Element.prototype.scrollIntoView = spy
    setup()
    expect(spy).not.toHaveBeenCalled()
  })

  it('selects on click', () => {
    const { onSelectStep } = setup()
    fireEvent.click(rowOf(5))
    expect(onSelectStep).toHaveBeenCalledWith('step-5')
  })

  it('marks the selected row as current', () => {
    setup(vi.fn(), 'step-5')
    expect(rowOf(5)).toHaveAttribute('aria-current', 'true')
    expect(rowOf(4)).not.toHaveAttribute('aria-current')
  })

  it('moves the selection with the arrow keys', () => {
    const { onSelectStep } = setup(vi.fn(), 'step-5')
    fireEvent.keyDown(rowOf(5), { key: 'ArrowDown' })
    expect(onSelectStep).toHaveBeenLastCalledWith('step-6')
    expect(rowOf(6)).toHaveFocus()
    fireEvent.keyDown(rowOf(6), { key: 'ArrowUp' })
    expect(onSelectStep).toHaveBeenLastCalledWith('step-5')
  })
})
