import { render, screen, fireEvent } from '@testing-library/react'
import { TraceConsoleList, TraceNetworkList, formatBytes } from '@components/TraceEventLists'
import '@testing-library/jest-dom'
import { eventsForStep, fromRaiderTrace } from '@foundation/trace/viewModel'
import type { RaiderTraceConsole, RaiderTraceNetwork } from '@shared/types/raiderTrace'
import { fixtureIndex } from '../helpers/traceFixture'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key}${JSON.stringify(values)}` : key
  })
}))

const index = fixtureIndex()
const api = index.network[2]

const request = (over: Partial<RaiderTraceNetwork> = {}): RaiderTraceNetwork => ({
  ...api,
  ...over
})

describe('TraceNetworkList', () => {
  it('shows the request line, status, timing and size', () => {
    const { container } = render(<TraceNetworkList items={[api]} available all={false} />)
    const text = container.textContent ?? ''
    for (const part of ['GET', 'http://127.0.0.1:55539/api', '200', '305 ms', '144 B']) {
      expect(text).toContain(part)
    }
  })

  it('says, visibly, that the size is what the browser reports', () => {
    render(<TraceNetworkList items={[api]} available all={false} />)
    const hint = screen.getByText('traceViewer.network.size')
    expect(hint.id).not.toBe('')
    expect(screen.getByText('144 B')).toHaveAttribute('aria-describedby', hint.id)
  })

  it('shows a failed request plainly and keeps the raw error in its details', () => {
    const { container } = render(
      <TraceNetworkList
        items={[request({ status: null, error: 'net::ERR_FAILED' })]}
        available
        all={false}
      />
    )
    expect(screen.getByText('traceViewer.network.failed')).toBeInTheDocument()
    expect(container.textContent).not.toContain('net::ERR_FAILED')
    fireEvent.click(screen.getByRole('button', { name: 'traceViewer.network.details' }))
    expect(screen.getByText('net::ERR_FAILED')).toBeInTheDocument()
  })

  it('keeps the query string and credentials out of the plain view', () => {
    const url = 'http://user:secret@127.0.0.1:55539/api?token=abc#frag'
    const { container } = render(
      <TraceNetworkList items={[request({ url })]} available all={false} />
    )
    const text = container.textContent ?? ''
    expect(text).toContain('http://127.0.0.1:55539/api')
    for (const raw of ['token=abc', 'secret', 'frag']) expect(text).not.toContain(raw)
    const toggle = screen.getByRole('button', { name: 'traceViewer.network.details' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(url)).toBeInTheDocument()
    expect(screen.getByText('application/json')).toBeInTheDocument()
  })

  it('says when a step has no requests, or the trace has none', () => {
    const { rerender } = render(<TraceNetworkList items={[]} available all={false} />)
    expect(screen.getByText('traceViewer.network.empty')).toBeInTheDocument()
    rerender(<TraceNetworkList items={[]} available all />)
    expect(screen.getByText('traceViewer.network.emptyAll')).toBeInTheDocument()
  })

  it('says unavailable instead of listing anything', () => {
    const { container } = render(<TraceNetworkList items={[api]} available={false} all />)
    expect(screen.getByText('traceViewer.unavailable')).toBeInTheDocument()
    expect(container.textContent).not.toContain('GET')
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
  })

  it('lists a request that belongs to no step only with all', () => {
    const view = fromRaiderTrace(index, vi.fn())
    const orphan = request({ stepIndex: null, url: 'http://127.0.0.1:55539/orphan' })
    const items = [...index.network, orphan]
    const step = view.byId.get('step-6')!
    const { container, rerender } = render(
      <TraceNetworkList items={eventsForStep(items, step, false)} available all={false} />
    )
    expect(container.textContent).not.toContain('/orphan')
    rerender(<TraceNetworkList items={eventsForStep(items, step, true)} available all />)
    expect(container.textContent).toContain('/orphan')
  })
})

describe('TraceConsoleList', () => {
  const message: RaiderTraceConsole = index.console[0]

  it('shows the level and text', () => {
    const { container } = render(<TraceConsoleList items={[message]} available all={false} />)
    expect(screen.getByText('traceViewer.console.level.error')).toBeInTheDocument()
    expect(screen.getByText('trace e2e error')).toBeInTheDocument()
    expect(container.textContent).not.toContain('55539')
    fireEvent.click(screen.getByRole('button', { name: 'traceViewer.console.details' }))
    expect(screen.getByText('http://127.0.0.1:55539/:18:17')).toBeInTheDocument()
  })

  it.each([
    ['log', 'log'],
    ['info', 'info'],
    ['warn', 'warning'],
    ['warning', 'warning'],
    ['debug', 'debug'],
    ['trace', 'other'],
    ['__proto__', 'other']
  ])('names the %s level through the copy', (level, key) => {
    render(<TraceConsoleList items={[{ ...message, level }]} available all={false} />)
    expect(screen.getByText(`traceViewer.console.level.${key}`)).toBeInTheDocument()
  })

  it('strips addresses in the text and keeps the raw text in its details', () => {
    const text =
      'Uncaught TypeError at https://u:p@example.com/app.js?token=abc#x and ' +
      'http://127.0.0.1:55539/api?key=s3cret'
    const { container } = render(
      <TraceConsoleList items={[{ ...message, text }]} available all={false} />
    )
    const plain = container.textContent ?? ''
    expect(plain).toContain(
      'Uncaught TypeError at https://example.com/app.js and http://127.0.0.1:55539/api'
    )
    for (const raw of ['token=abc', 'u:p@', 's3cret', '#x']) expect(plain).not.toContain(raw)
    fireEvent.click(screen.getByRole('button', { name: 'traceViewer.console.details' }))
    expect(screen.getByText(text)).toBeInTheDocument()
  })

  it('cuts long text to 300 characters in the plain view', () => {
    const text = 'a'.repeat(400)
    render(<TraceConsoleList items={[{ ...message, text, source: null }]} available all={false} />)
    expect(screen.getByText(`${'a'.repeat(300)}…`)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'traceViewer.console.details' }))
    expect(screen.getByText(text)).toBeInTheDocument()
  })

  it('says when there are no messages', () => {
    const { rerender } = render(<TraceConsoleList items={[]} available all={false} />)
    expect(screen.getByText('traceViewer.console.empty')).toBeInTheDocument()
    rerender(<TraceConsoleList items={[]} available all />)
    expect(screen.getByText('traceViewer.console.emptyAll')).toBeInTheDocument()
  })

  it('says unavailable instead of listing anything', () => {
    const { container } = render(<TraceConsoleList items={[message]} available={false} all />)
    expect(screen.getByText('traceViewer.unavailable')).toBeInTheDocument()
    expect(container.textContent).not.toContain('trace e2e error')
  })
})

describe('formatBytes', () => {
  it.each([
    [880, '880 B'],
    [1229, '1.2 KB'],
    [3.4 * 1024 * 1024, '3.4 MB'],
    [null, ''],
    [-1, ''],
    [Number.NaN, '']
  ])('formats %s as %j', (n, expected) => {
    expect(formatBytes(n)).toBe(expected)
  })
})

describe('TraceNetworkList mocked badges', () => {
  it('shows Mocked for a fulfilled mock and Blocked by test for a failed one', () => {
    render(
      <TraceNetworkList
        items={[
          request({ mocked: 'fulfilled' }),
          request({ mocked: 'failed', status: null, error: 'net::ERR_FAILED' })
        ]}
        available
        all={false}
      />
    )
    expect(screen.getByText('traceViewer.network.mocked')).toBeInTheDocument()
    expect(screen.getByText('traceViewer.network.blockedByTest')).toBeInTheDocument()
    expect(screen.getByText('traceViewer.network.failed')).toBeInTheDocument()
  })

  it('describes each badge with a visible hint and a tooltip', () => {
    render(
      <TraceNetworkList
        items={[request({ mocked: 'fulfilled' }), request({ mocked: 'failed' })]}
        available
        all={false}
      />
    )
    const hint = screen.getByText('traceViewer.network.mockedHint')
    expect(hint.id).not.toBe('')
    for (const key of ['traceViewer.network.mocked', 'traceViewer.network.blockedByTest']) {
      const badge = screen.getByText(key)
      expect(badge).toHaveAttribute('aria-describedby', hint.id)
      expect(badge).toHaveAttribute('title', 'traceViewer.network.mockedHint')
    }
  })

  it('shows no badge and no hint when no request was mocked', () => {
    const { container } = render(
      <TraceNetworkList items={[request({ mocked: null })]} available all={false} />
    )
    expect(container.textContent).not.toContain('traceViewer.network.mocked')
    expect(container.textContent).not.toContain('traceViewer.network.blockedByTest')
  })
})
