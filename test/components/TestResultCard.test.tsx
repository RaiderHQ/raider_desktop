import { render, screen, fireEvent, act } from '@testing-library/react'
import TestResultCard from '@components/TestResultCard'
import '@testing-library/jest-dom'
import { readFileSync } from 'fs'
import { loadRaiderResults } from '@foundation/raiderResults'

vi.mock('react-i18next', () => ({
  useTranslation: (): { t: (key: string) => string } => ({ t: (key: string): string => key })
}))

vi.mock('react-router', () => ({ useNavigate: (): (() => void) => vi.fn() }))

vi.mock('react-hot-toast', () => ({ default: { error: vi.fn() } }))

beforeEach(() => {
  window.api = {
    readFile: vi.fn().mockResolvedValue({ success: false }),
    readImage: vi.fn().mockResolvedValue({ success: true, data: 'base64data' })
  } as unknown as typeof window.api
})

describe('TestResultCard', () => {
  it('renders the test name', () => {
    render(<TestResultCard name="login test" status="passed" />)
    expect(screen.getByText('login test')).toBeInTheDocument()
  })

  it('is collapsed by default (status detail not visible)', () => {
    render(<TestResultCard name="login test" status="passed" />)
    expect(screen.queryByText(/testResults\.status/)).not.toBeInTheDocument()
  })

  it('expands to show status when clicked', () => {
    render(<TestResultCard name="login test" status="passed" />)
    fireEvent.click(screen.getByText('login test'))
    expect(screen.getByText(/testResults\.status/)).toBeInTheDocument()
  })

  it('shows failure message when expanded and message provided', () => {
    render(<TestResultCard name="fail test" status="failed" message="expected true got false" />)
    fireEvent.click(screen.getByText('fail test'))
    expect(screen.getByText('expected true got false')).toBeInTheDocument()
  })

  it('shows screenshot button when screenshot prop is provided and card is expanded', () => {
    render(<TestResultCard name="t" status="passed" screenshot="/path/to/img.png" />)
    fireEvent.click(screen.getByText('t'))
    expect(screen.getByText('testResults.viewScreenshot')).toBeInTheDocument()
  })

  it('does not show screenshot button when screenshot prop is not provided', () => {
    render(<TestResultCard name="t" status="passed" />)
    fireEvent.click(screen.getByText('t'))
    expect(screen.queryByText('testResults.viewScreenshot')).not.toBeInTheDocument()
  })

  it('opens screenshot modal when screenshot button clicked', async () => {
    render(<TestResultCard name="t" status="passed" screenshot="/path/img.png" />)
    fireEvent.click(screen.getByText('t'))
    await act(async () => {
      fireEvent.click(screen.getByText('testResults.viewScreenshot'))
    })
    expect(window.api.readImage).toHaveBeenCalledWith('/path/img.png')
  })


  it('shows a quarantined badge with its tooltip and still shows the failure', () => {
    vi.useFakeTimers()
    try {
      render(
        <TestResultCard
          name="flaky"
          status="quarantined"
          message="Net::ReadTimeout"
          backtrace={['a.rb:1']}
        />
      )
      const badge = screen.getByTestId('quarantined-badge')
      expect(badge).toHaveTextContent('testResults.quarantined')
      fireEvent.mouseEnter(badge.parentElement as HTMLElement)
      act(() => {
        vi.advanceTimersByTime(500)
      })
      expect(screen.getByText('testResults.quarantinedTooltip')).toBeInTheDocument()

      fireEvent.click(screen.getByText('flaky'))
      expect(screen.getByText('Net::ReadTimeout')).toBeInTheDocument()
      expect(screen.getByText('a.rb:1')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows no quarantined badge for a failed test', () => {
    render(<TestResultCard name="bad" status="failed" />)
    expect(screen.queryByTestId('quarantined-badge')).not.toBeInTheDocument()
  })

  it('renders a collapsed video player with a raider-media src when video is set', () => {
    const video = '/proj/raider-results/attachments/0-video.webm'
    render(<TestResultCard name="vid test" status="failed" video={video} />)
    fireEvent.click(screen.getByText('vid test'))
    const el = screen.getByTestId('result-video') as HTMLVideoElement
    expect(el.getAttribute('src')).toBe(`raider-media://file/${encodeURIComponent(video)}`)
    expect(el.getAttribute('preload')).toBe('metadata')
    expect(el.closest('details')).not.toHaveAttribute('open')
    expect(screen.getByText('testResults.video')).toBeInTheDocument()
  })

  it('renders no video element when video is absent', () => {
    render(<TestResultCard name="vid test" status="failed" />)
    fireEvent.click(screen.getByText('vid test'))
    expect(screen.queryByTestId('result-video')).not.toBeInTheDocument()
  })
})

describe('TestResultCard failure details', () => {
  const failure = { message: 'boom', backtrace: [] as string[] }

  it.each(['failed', 'broken', 'quarantined'])(
    'renders failure-details for %s with failure',
    (status) => {
      render(<TestResultCard name="Example" status={status} failure={failure} />)
      fireEvent.click(screen.getByText('Example'))
      expect(screen.getByTestId('failure-details')).toBeInTheDocument()
    }
  )

  it('does not render failure-details for passed', () => {
    render(<TestResultCard name="Example" status="passed" failure={failure} />)
    fireEvent.click(screen.getByText('Example'))
    expect(screen.queryByTestId('failure-details')).not.toBeInTheDocument()
  })

  it('keeps the old message and screenshot link without failure', () => {
    render(
      <TestResultCard name="Example" status="failed" message="old msg" screenshot="/p/s.png" />
    )
    fireEvent.click(screen.getByText('Example'))
    expect(screen.queryByTestId('failure-details')).not.toBeInTheDocument()
    expect(screen.getByText('old msg')).toBeInTheDocument()
    expect(screen.getByText('testResults.viewScreenshot')).toBeInTheDocument()
  })
})

describe('TestResultCard with a mobile (Appium) result', () => {
  it('shows the mp4 video and no browser row', async () => {
    const run = readFileSync('test/fixtures/results/mobile-run.json', 'utf8')
    const rows = await loadRaiderResults('/proj', {
      readDirectory: async () => [
        { name: 'run.json', type: 'file', path: '/proj/raider-results/run.json' }
      ],
      readFile: async () => ({ success: true, data: run })
    })
    const row = rows!.find((r) => r.status === 'failed')!
    render(
      <TestResultCard
        name={row.name}
        status={row.status}
        screenshot={row.screenshot}
        video={row.video}
        message={row.statusDetails?.message}
        failure={row.failure}
        durationMs={row.durationMs}
        browser={row.browser}
        projectPath="/proj"
      />
    )
    fireEvent.click(screen.getByText('Login rejects a wrong password'))
    const video = screen.getByTestId('result-video')
    expect(video.getAttribute('src')).toBe(
      `raider-media://file/${encodeURIComponent('/proj/raider-results/attachments/0-video.mp4')}`
    )
    expect(screen.getByTestId('failure-details')).toBeInTheDocument()
    expect(screen.getByText(/6100 ms/)).toBeInTheDocument()
    expect(screen.queryByText(/chrome|firefox|safari|browser/i)).not.toBeInTheDocument()
  })

  it('renders a code test as before: no failed-step line, details open', () => {
    render(
      <TestResultCard
        name="code test"
        status="failed"
        failure={{ message: 'boom', exceptionClass: 'RuntimeError', backtrace: ['a.rb:1'] }}
        result={{ name: 'code test', status: 'failed' }}
      />
    )
    fireEvent.click(screen.getByText('code test'))
    expect(screen.queryByTestId('failed-step-line')).toBeNull()
    expect(screen.queryByTestId('technical-details')).toBeNull()
    expect(screen.getByText('RuntimeError')).toBeInTheDocument()
    expect(screen.getByText('boom')).toBeInTheDocument()
  })
})

describe('TestResultCard saved traces', () => {
  it('offers Open trace on any card with traces', () => {
    render(
      <TestResultCard
        name="t"
        status="passed"
        traces={[{ path: '/p/raider-results/attachments/0-trace.zip', attempt: 1 }]}
      />
    )
    fireEvent.click(screen.getByText('t'))
    expect(screen.getByText('traceViewer.open')).toBeInTheDocument()
  })

  it('offers no Open trace without traces', () => {
    render(<TestResultCard name="t" status="passed" />)
    fireEvent.click(screen.getByText('t'))
    expect(screen.queryByText('traceViewer.open')).not.toBeInTheDocument()
  })
})

describe('TestResultCard screenshot comparisons', () => {
  const comparison = {
    name: 'home',
    status: 'failed' as const,
    baseline: 'screenshots/baselines/chrome/home.png',
    diffPixels: 10,
    diffRatio: 0.01,
    threshold: 0.1,
    maxDiffPixels: 0,
    maxDiffRatio: null,
    expectedSize: null,
    actualSize: null,
    images: { diff: '/p/raider-results/attachments/d.png' }
  }

  it('shows the comparison section when the result has comparisons', async () => {
    render(
      <TestResultCard
        name="cmp"
        status="failed"
        result={{ name: 'cmp', status: 'failed', comparisons: [comparison] }}
      />
    )
    fireEvent.click(screen.getByText('cmp'))
    expect(screen.getByText('screenshotComparison.title')).toBeInTheDocument()
    expect(await screen.findByAltText('screenshotComparison.imageAlt')).toBeInTheDocument()
  })

  it('shows no comparison section without comparisons', () => {
    render(<TestResultCard name="cmp" status="passed" result={{ name: 'cmp', status: 'passed' }} />)
    fireEvent.click(screen.getByText('cmp'))
    expect(screen.queryByText('screenshotComparison.title')).not.toBeInTheDocument()
  })
})
