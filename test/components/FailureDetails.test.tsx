import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { vi } from 'vitest'
import FailureDetails from '@components/FailureDetails'

const navigate = vi.fn()
vi.mock('react-router', () => ({ useNavigate: (): typeof navigate => navigate }))
vi.mock('react-i18next', () => ({
  useTranslation: (): { t: (k: string, o?: { count?: number }) => string } => ({
    t: (k, o) => (k === 'testResults.moreFrames' ? `… ${o?.count} more` : k)
  })
}))

const failure = {
  message: 'expected true',
  exceptionClass: 'RSpec::Expectations::ExpectationNotMetError',
  appFrame: 'spec/a_spec.rb:12:in `block (2 levels)`',
  backtrace: [
    '/gems/rspec/lib/a.rb:1',
    '/gems/rspec/lib/b.rb:2',
    'spec/a_spec.rb:12:in `block`',
    '/gems/rspec/lib/c.rb:3'
  ]
}

const setReadFile = (success: boolean): void => {
  window.api = {
    readFile: vi.fn().mockResolvedValue({ success }),
    readImage: vi.fn().mockResolvedValue({ success: true, data: 'AAAA' })
  } as unknown as typeof window.api
}

describe('FailureDetails', () => {
  beforeEach(() => {
    navigate.mockClear()
    setReadFile(true)
  })

  it('renders the message and exception class', () => {
    render(<FailureDetails failure={failure} projectPath="/p" />)
    expect(screen.getByText('expected true')).toBeInTheDocument()
    expect(screen.getByText(failure.exceptionClass)).toBeInTheDocument()
  })

  it('shows file:line with the full app_frame as title and opens the editor', async () => {
    render(<FailureDetails failure={failure} projectPath="/p" />)
    const loc = screen.getByTestId('failure-location')
    expect(loc).toHaveTextContent('spec/a_spec.rb:12')
    expect(loc).toHaveAttribute('title', failure.appFrame)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'spec/a_spec.rb:12' })).toBeInTheDocument()
    )
    fireEvent.click(screen.getByTestId('failure-location'))
    expect(navigate).toHaveBeenCalledWith('/file-editor', {
      state: { fileName: 'a_spec.rb', filePath: '/p/spec/a_spec.rb', line: 12 }
    })
  })

  it('renders plain text when the file cannot be read', async () => {
    setReadFile(false)
    render(<FailureDetails failure={failure} projectPath="/p" />)
    await waitFor(() => expect(window.api.readFile).toHaveBeenCalled())
    expect(screen.getByTestId('failure-location').tagName).not.toBe('BUTTON')
    expect(screen.queryByRole('button', { name: 'spec/a_spec.rb:12' })).toBeNull()
  })

  it('shows duration and browser next to the location', () => {
    render(<FailureDetails failure={failure} projectPath="/p" durationMs={420} browser="chrome" />)
    expect(screen.getByTestId('failure-location-row')).toHaveTextContent('· 420 ms · chrome')
  })

  it('omits location and trace toggle without app_frame and backtrace', () => {
    render(<FailureDetails failure={{ message: 'm', backtrace: [] }} projectPath="/p" />)
    expect(screen.getByText('m')).toBeInTheDocument()
    expect(screen.queryByTestId('failure-location')).toBeNull()
    expect(screen.queryByTestId('stack-trace-toggle')).toBeNull()
  })

  it('keeps the trace closed, then shows project and folded frames', () => {
    render(<FailureDetails failure={failure} projectPath="/p" />)
    expect(screen.queryByTestId('stack-frame-project')).toBeNull()
    fireEvent.click(screen.getByTestId('stack-trace-toggle'))
    expect(screen.getAllByTestId('stack-frame-project')).toHaveLength(1)
    const folded = screen.getAllByTestId('stack-frames-folded')
    expect(folded[0]).toHaveTextContent('… 2 more')
    expect(screen.queryByText('/gems/rspec/lib/a.rb:1')).toBeNull()
    fireEvent.click(folded[0].querySelector('button')!)
    expect(screen.getByText('/gems/rspec/lib/a.rb:1')).toBeInTheDocument()
  })

  it('renders no image without a screenshot, and opens the screenshot when present', async () => {
    const { rerender } = render(<FailureDetails failure={failure} projectPath="/p" />)
    expect(screen.queryByRole('img')).toBeNull()
    const open = vi.fn()
    rerender(
      <FailureDetails
        failure={failure}
        projectPath="/p"
        screenshot="/p/s.png"
        onOpenScreenshot={open}
      />
    )
    fireEvent.click(await screen.findByRole('img'))
    expect(open).toHaveBeenCalled()
  })

  it('keeps a View Screenshot fallback while the thumbnail is not loaded', () => {
    window.api = {
      readFile: vi.fn().mockResolvedValue({ success: true }),
      readImage: vi.fn().mockResolvedValue({ success: false })
    } as unknown as typeof window.api
    const open = vi.fn()
    render(<FailureDetails failure={failure} screenshot="/p/s.png" onOpenScreenshot={open} />)
    fireEvent.click(screen.getByTestId('screenshot-fallback'))
    expect(open).toHaveBeenCalled()
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('exposes aria-expanded on the folded toggle', () => {
    render(<FailureDetails failure={failure} projectPath="/p" />)
    fireEvent.click(screen.getByTestId('stack-trace-toggle'))
    const btn = screen.getAllByTestId('stack-frames-folded')[0].querySelector('button')!
    expect(btn).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(btn)
    expect(btn).toHaveAttribute('aria-expanded', 'true')
  })
})
