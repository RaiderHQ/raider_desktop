import { render, screen, fireEvent, act } from '@testing-library/react'
import TraceTimeline from '@components/TraceTimeline'
import '@testing-library/jest-dom'
import type { TraceStep } from '@foundation/Types/traceStep'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

const mockApi = {
  readImage: vi.fn().mockResolvedValue({ success: false })
}

beforeEach(() => {
  window.api = mockApi as any
  vi.clearAllMocks()
})

const makeStep = (overrides: Partial<TraceStep> = {}): TraceStep => ({
  id: 'step-1',
  command: '@driver.get("https://example.com")',
  timestamp: 1000000,
  url: 'https://example.com',
  ...overrides
})

describe('TraceTimeline', () => {
  it('shows empty state when no steps', () => {
    render(
      <TraceTimeline steps={[]} selectedStepId={null} onSelectStep={vi.fn()} />
    )
    expect(screen.getByText('recorder.traceTimeline.noTrace')).toBeInTheDocument()
  })

  it('renders the timeline title', () => {
    render(
      <TraceTimeline
        steps={[makeStep()]}
        selectedStepId={null}
        onSelectStep={vi.fn()}
      />
    )
    expect(screen.getByText('recorder.traceTimeline.title')).toBeInTheDocument()
  })

  it('renders step index number', () => {
    render(
      <TraceTimeline
        steps={[makeStep(), makeStep({ id: 'step-2', timestamp: 1002000 })]}
        selectedStepId={null}
        onSelectStep={vi.fn()}
      />
    )
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('renders time deltas from first step', () => {
    const steps = [
      makeStep({ id: 's1', timestamp: 1000000 }),
      makeStep({ id: 's2', timestamp: 1003500 })
    ]
    render(
      <TraceTimeline steps={steps} selectedStepId={null} onSelectStep={vi.fn()} />
    )
    expect(screen.getByText('+0.0s')).toBeInTheDocument()
    expect(screen.getByText('+3.5s')).toBeInTheDocument()
  })

  it('calls onSelectStep when a step is clicked', () => {
    const onSelectStep = vi.fn()
    const { container } = render(
      <TraceTimeline
        steps={[makeStep({ id: 'step-abc' })]}
        selectedStepId={null}
        onSelectStep={onSelectStep}
      />
    )
    const button = container.querySelector('button')!
    fireEvent.click(button)
    expect(onSelectStep).toHaveBeenCalledWith('step-abc')
  })

  it('highlights the selected step', () => {
    const { container } = render(
      <TraceTimeline
        steps={[makeStep({ id: 'step-1' }), makeStep({ id: 'step-2' })]}
        selectedStepId="step-1"
        onSelectStep={vi.fn()}
      />
    )
    const buttons = container.querySelectorAll('button')
    expect(buttons[0].className).toContain('border-ruby')
    expect(buttons[1].className).not.toContain('border-ruby')
  })

  it('shows placeholder when screenshot is not loaded', () => {
    render(
      <TraceTimeline
        steps={[makeStep({ screenshotPath: '/path/to/shot.png' })]}
        selectedStepId={null}
        onSelectStep={vi.fn()}
      />
    )
    // Placeholder "..." is shown before image loads
    expect(screen.getByText('...')).toBeInTheDocument()
  })

  it('loads screenshot thumbnails when screenshotPath is provided', async () => {
    mockApi.readImage.mockResolvedValue({
      success: true,
      data: 'base64data',
      fileExt: 'png'
    })

    await act(async () => {
      render(
        <TraceTimeline
          steps={[makeStep({ screenshotPath: '/path/to/shot.png' })]}
          selectedStepId={null}
          onSelectStep={vi.fn()}
        />
      )
    })

    expect(mockApi.readImage).toHaveBeenCalledWith('/path/to/shot.png')
    const img = screen.getByAltText('Step 1')
    expect(img).toBeInTheDocument()
    expect(img.getAttribute('src')).toContain('data:image/png;base64,base64data')
  })
})
