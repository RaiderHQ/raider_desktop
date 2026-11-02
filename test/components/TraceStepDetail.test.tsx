import { render, screen, fireEvent, act } from '@testing-library/react'
import TraceStepDetail from '@components/TraceStepDetail'
import '@testing-library/jest-dom'
import { fromRaiderTrace, type TraceView, type TraceViewStep } from '@foundation/trace/viewModel'
import type { TraceEntryResult } from '@shared/types/raiderTrace'
import { fixtureIndex } from '../helpers/traceFixture'
import { sanitizeSnapshot } from '@foundation/trace/sanitizeSnapshot'

vi.mock('@foundation/trace/sanitizeSnapshot', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@foundation/trace/sanitizeSnapshot')>()
  return { ...actual, sanitizeSnapshot: vi.fn(actual.sanitizeSnapshot) }
})

// Keys come out as ⟦key⟧, which no trace data contains, followed by the
// interpolated values as plain text; so the leak checks can drop exactly the
// keys and still see any raw data next to them.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => {
      const plain = values ? Object.values(values).map(String).join(' ') : ''
      return plain ? `⟦${key}⟧ ${plain}` : `⟦${key}⟧`
    }
  })
}))

const k = (key: string): string => `⟦${key}⟧`

const IMAGE = (n: string): string => `data:image/jpeg;base64,${n}`

const read = vi.fn()
let view: TraceView

const stepOf = (n: number, from: TraceView = view): TraceViewStep => from.byId.get(`step-${n}`)!

const show = (n: number) =>
  render(<TraceStepDetail traceKey="a" step={stepOf(n)} devicePixelRatio={view.devicePixelRatio} />)

// Drops the keys (traceViewer.step.eventually would trip the checks) and
// keeps the interpolated values and everything else.
const plainText = (container: HTMLElement): string =>
  (container.textContent ?? '').replace(/⟦[^⟧]*⟧/g, '')

const loadImage = async (img: HTMLElement, width = 1920, height = 937): Promise<void> => {
  Object.defineProperty(img, 'naturalWidth', { value: width, configurable: true })
  Object.defineProperty(img, 'naturalHeight', { value: height, configurable: true })
  fireEvent.load(img)
}

beforeEach(() => {
  vi.mocked(sanitizeSnapshot).mockClear()
  read.mockReset()
  read.mockImplementation(async (name: string) =>
    name.endsWith('.html')
      ? {
          ok: true,
          kind: 'html',
          text: '<html><head></head><body><p>Hi</p><script>x()</script></body></html>'
        }
      : { ok: true, kind: 'image', dataUrl: IMAGE(name) }
  )
  view = fromRaiderTrace(fixtureIndex(), read)
})

describe('TraceStepDetail', () => {
  it('asks for a step when none is selected', () => {
    render(<TraceStepDetail step={null} devicePixelRatio={1} />)
    expect(screen.getByText(k('traceViewer.selectStep'))).toBeInTheDocument()
  })

  it('shows the plain sentence and found-by line', async () => {
    const { container } = show(2)
    await act(async () => {})
    expect(container.textContent).toContain(k('traceViewer.step.typeSecret'))
    expect(screen.getByText(k('traceViewer.foundBy.id'))).toBeInTheDocument()
  })

  it.each([2, 9])('keeps raw data out of the default view of step %i', async (n) => {
    const { container } = show(n)
    await act(async () => {})
    const text = plainText(container)
    for (const raw of [
      'send_keys',
      '"pw"',
      'id: pw',
      'RSpec::',
      'spec/trace_replay_spec.rb',
      'eventually'
    ]) {
      expect(text).not.toContain(raw)
    }
    expect(text).not.toMatch(/\bpw\b/)
  })

  it('the leak check sees raw data right next to a key', () => {
    const { container } = render(
      <div>
        <span>{k('traceViewer.foundBy.id')}</span>
        <span>send_keys</span>
        <span>{k('traceViewer.failedStep')}</span>
        <span>RSpec::Expectations</span>
      </div>
    )
    const text = plainText(container)
    expect(text).toContain('send_keys')
    expect(text).toContain('RSpec::')
    expect(text).not.toContain('traceViewer')
  })

  it('technical details render only when open', async () => {
    show(2)
    await act(async () => {})
    expect(screen.queryByText('send_keys')).toBeNull()
    const toggle = screen.getByRole('button', { name: k('traceViewer.technical.show') })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('send_keys')).toBeInTheDocument()
    expect(screen.getByText('id: pw')).toBeInTheDocument()
    expect(screen.getByText(k('traceViewer.technical.hidden'))).toBeInTheDocument()
    expect(screen.getByText('spec/trace_replay_spec.rb:9')).toBeInTheDocument()
  })

  it('lists each enclosing locator under Inside', () => {
    const step = stepOf(2)
    const raw = {
      ...step.raw!,
      locator: {
        strategy: 'id',
        selector: 'pw',
        within: [{ strategy: 'css', selector: 'form.login' }]
      }
    }
    render(<TraceStepDetail step={{ ...step, raw }} devicePixelRatio={1} />)
    fireEvent.click(screen.getByRole('button', { name: k('traceViewer.technical.show') }))
    expect(screen.getByText(k('traceViewer.technical.within'))).toBeInTheDocument()
    expect(screen.getByText('css: form.login')).toBeInTheDocument()
  })

  it('shows the error class and message only in technical details', async () => {
    const { container } = show(9)
    await act(async () => {})
    expect(screen.getByText(k('traceViewer.failedStep'))).toBeInTheDocument()
    expect(container.textContent).not.toContain('RSpec::Expectations::ExpectationNotMetError')
    expect(container.textContent).not.toContain('deliberate trace failure')
    fireEvent.click(screen.getByRole('button', { name: k('traceViewer.technical.show') }))
    expect(screen.getByText('RSpec::Expectations::ExpectationNotMetError')).toBeInTheDocument()
    expect(container.textContent).toContain('deliberate trace failure')
  })

  it('never shows a secret value', async () => {
    const step = stepOf(5)
    const secret: TraceViewStep = {
      ...step,
      raw: {
        ...step.raw!,
        secret: true,
        value: 'hunter2',
        error: { className: 'Error', message: 'boom' }
      }
    }
    const { container } = render(<TraceStepDetail step={secret} devicePixelRatio={1} />)
    await act(async () => {})
    // The error may echo the secret: Technical details only.
    expect(container.textContent).not.toContain('boom')
    fireEvent.click(screen.getByRole('button', { name: k('traceViewer.technical.show') }))
    const text = container.textContent ?? ''
    expect(text).not.toContain('hunter2')
    expect(text).not.toContain('•')
    expect(text).not.toContain('*')
    expect(screen.getByText(k('traceViewer.technical.hidden'))).toBeInTheDocument()
  })

  it('shows the value of a step that is not secret, in technical details', async () => {
    show(5)
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: k('traceViewer.technical.show') }))
    expect(screen.getByText('plain-trace-name')).toBeInTheDocument()
  })

  it('draws the rect labelled "element before the action"', async () => {
    show(2)
    await act(async () => {})
    const img = screen.getByRole('img', { name: `${k('traceViewer.stepImage')} 2` })
    expect(img.getAttribute('src')).toMatch(/^data:image\/jpeg/)
    expect(screen.queryByTestId('trace-rect')).toBeNull()
    await loadImage(img)
    const rect = screen.getByTestId('trace-rect')
    expect(parseFloat(rect.style.left)).toBeCloseTo(0.4167, 3)
    expect(rect).toHaveAttribute('aria-label', k('traceViewer.rectLabel'))
  })

  it('draws no rect when step.rect is null', async () => {
    show(1)
    await act(async () => {})
    await loadImage(screen.getByRole('img', { name: `${k('traceViewer.stepImage')} 1` }))
    expect(screen.queryByTestId('trace-rect')).toBeNull()
  })

  it('says Not captured for both views of step 4', async () => {
    show(4)
    await act(async () => {})
    expect(screen.getByText(k('traceViewer.notCaptured'))).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: k('traceViewer.view.snapshot') }))
    await act(async () => {})
    expect(screen.getByText(k('traceViewer.notCaptured'))).toBeInTheDocument()
    expect(read).not.toHaveBeenCalled()
  })

  it('loads the page HTML only when that view is chosen', async () => {
    show(2)
    await act(async () => {})
    expect(read).not.toHaveBeenCalledWith('steps/0002.html')
    fireEvent.click(screen.getByRole('button', { name: k('traceViewer.view.snapshot') }))
    await act(async () => {})
    expect(read).toHaveBeenCalledWith('steps/0002.html')
  })

  it('does not reload or re-sanitise the page HTML when its view is chosen again', async () => {
    const { container } = show(2)
    await act(async () => {})
    const snapshotButton = screen.getByRole('button', { name: k('traceViewer.view.snapshot') })
    const screenshotButton = screen.getByRole('button', { name: k('traceViewer.view.screenshot') })
    fireEvent.click(snapshotButton)
    await act(async () => {})
    fireEvent.click(screenshotButton)
    fireEvent.click(snapshotButton)
    await act(async () => {})
    expect(read.mock.calls.filter(([name]) => name === 'steps/0002.html')).toHaveLength(1)
    expect(sanitizeSnapshot).toHaveBeenCalledTimes(1)
    expect(container.querySelector('iframe[data-testid="trace-snapshot"]')).not.toBeNull()
  })

  it('takes its heading level and labels the view switch', async () => {
    render(<TraceStepDetail traceKey="a" step={stepOf(2)} devicePixelRatio={1} headingLevel={2} />)
    await act(async () => {})
    expect(screen.getByRole('heading', { level: 2 }).textContent).toContain(
      k('traceViewer.step.typeSecret')
    )
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(
      k('traceViewer.view.screenshot')
    )
    const group = screen.getByRole('group', { name: k('traceViewer.view.label') })
    expect(group.querySelectorAll('button[aria-pressed]')).toHaveLength(2)
  })

  it('uses h3 for the title by default', async () => {
    show(2)
    await act(async () => {})
    expect(screen.getByRole('heading', { level: 3 }).textContent).toContain(
      k('traceViewer.step.typeSecret')
    )
    expect(screen.getByRole('heading', { level: 4 })).toBeInTheDocument()
  })

  it('shows the snapshot in a frame with an empty sandbox', async () => {
    const { container } = show(2)
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: k('traceViewer.view.snapshot') }))
    await act(async () => {})
    const frame = container.querySelector('iframe[data-testid="trace-snapshot"]')!
    expect(frame.getAttribute('sandbox')).toBe('')
    expect(frame.hasAttribute('src')).toBe(false)
    expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer')
    const srcdoc = frame.getAttribute('srcdoc')!
    expect(srcdoc.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(srcdoc).toContain('Content-Security-Policy')
    expect(srcdoc).not.toContain('<script')
  })

  it('shows an xml snapshot as text, not in a frame', async () => {
    read.mockImplementation(async () => ({
      ok: true,
      kind: 'xml',
      text: '<hierarchy><node/></hierarchy>'
    }))
    const { container } = show(2)
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: k('traceViewer.view.snapshot') }))
    await act(async () => {})
    expect(container.querySelector('iframe')).toBeNull()
    expect(container.querySelector('pre')?.textContent).toBe('<hierarchy><node/></hierarchy>')
  })

  it('shows only the latest step when an earlier image arrives late', async () => {
    let resolve2: (v: unknown) => void = () => {}
    read.mockImplementation((name: string) =>
      name === 'steps/0002.jpg'
        ? new Promise((r) => (resolve2 = r))
        : Promise.resolve({ ok: true, kind: 'image', dataUrl: IMAGE('FIVE') })
    )
    view = fromRaiderTrace(fixtureIndex(), read)
    const { rerender } = show(2)
    await act(async () => {})
    rerender(<TraceStepDetail traceKey="a" step={stepOf(5)} devicePixelRatio={1} />)
    await act(async () => {})
    await act(async () => resolve2({ ok: true, kind: 'image', dataUrl: IMAGE('TWO') }))
    const imgs = screen.getAllByRole('img', { name: /traceViewer\.stepImage/ })
    expect(imgs).toHaveLength(1)
    expect(imgs[0]).toHaveAttribute('src', IMAGE('FIVE'))
    await loadImage(imgs[0])
    // Step 5's own rect (x 322), never step 2's (x 8).
    expect(screen.getAllByTestId('trace-rect')).toHaveLength(1)
    expect(parseFloat(screen.getByTestId('trace-rect').style.left)).toBeCloseTo(
      (322 / 1920) * 100,
      3
    )
  })

  it('does not carry an image or its size over to the next step', async () => {
    const { rerender } = show(2)
    await act(async () => {})
    await loadImage(screen.getByRole('img'))
    expect(screen.getByTestId('trace-rect')).toBeInTheDocument()
    let resolve5: (v: unknown) => void = () => {}
    read.mockImplementation(() => new Promise((r) => (resolve5 = r)))
    const next = fromRaiderTrace(fixtureIndex(), read)
    rerender(<TraceStepDetail traceKey="a" step={stepOf(5, next)} devicePixelRatio={1} />)
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.queryByTestId('trace-rect')).toBeNull()
    await act(async () => resolve5({ ok: true, kind: 'image', dataUrl: IMAGE('FIVE') }))
    expect(screen.getByRole('img')).toHaveAttribute('src', IMAGE('FIVE'))
    expect(screen.queryByTestId('trace-rect')).toBeNull()
  })

  it('drops a late image from a trace that was replaced', async () => {
    let resolveOld: (v: unknown) => void = () => {}
    read.mockImplementation(() => new Promise((r) => (resolveOld = r)))
    view = fromRaiderTrace(fixtureIndex(), read)
    const { rerender } = show(2)
    await act(async () => {})
    const readNew = vi.fn((): Promise<TraceEntryResult> => new Promise(() => {}))
    const other = fromRaiderTrace(fixtureIndex(), readNew)
    rerender(<TraceStepDetail traceKey="b" step={stepOf(2, other)} devicePixelRatio={1} />)
    await act(async () => resolveOld({ ok: true, kind: 'image', dataUrl: IMAGE('OLD') }))
    expect(screen.queryByRole('img')).toBeNull()
    expect(readNew).toHaveBeenCalledWith('steps/0002.jpg')
  })

  it('shows waited time and retries', async () => {
    const { container } = show(6)
    await act(async () => {})
    expect(container.textContent).toContain(`${k('traceViewer.waited')} 0.1`)
    expect(container.textContent).toContain(`${k('traceViewer.retries')} 1`)
  })
})
