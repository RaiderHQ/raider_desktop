import { render, screen, fireEvent, act } from '@testing-library/react'
import TestResultCard from '@components/TestResultCard'
import '@testing-library/jest-dom'

vi.mock('react-i18next', () => ({
  useTranslation: (): { t: (key: string) => string } => ({ t: (key: string): string => key })
}))

vi.mock('react-hot-toast', () => ({ default: { error: vi.fn() } }))

beforeEach(() => {
  window.api = {
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
