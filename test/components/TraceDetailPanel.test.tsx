import { render, screen, act } from '@testing-library/react'
import TraceDetailPanel from '@components/TraceDetailPanel'
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
  timestamp: Date.now(),
  url: 'https://example.com',
  ...overrides
})

describe('TraceDetailPanel', () => {
  it('shows empty state when no step is selected', () => {
    render(<TraceDetailPanel step={null} />)
    expect(screen.getByText('Select a step to view details')).toBeInTheDocument()
  })

  it('renders command text', () => {
    render(<TraceDetailPanel step={makeStep()} />)
    expect(screen.getByText('@driver.get("https://example.com")')).toBeInTheDocument()
  })

  it('renders command section heading', () => {
    render(<TraceDetailPanel step={makeStep()} />)
    expect(screen.getByText('recorder.traceDetail.command')).toBeInTheDocument()
  })

  it('renders page URL', () => {
    render(<TraceDetailPanel step={makeStep({ url: 'https://test.com/page' })} />)
    expect(screen.getByText('recorder.traceDetail.pageUrl')).toBeInTheDocument()
    expect(screen.getByText('https://test.com/page')).toBeInTheDocument()
  })

  it('does not render URL section when url is empty', () => {
    render(<TraceDetailPanel step={makeStep({ url: '' })} />)
    expect(screen.queryByText('recorder.traceDetail.pageUrl')).not.toBeInTheDocument()
  })

  it('renders timestamp section', () => {
    render(<TraceDetailPanel step={makeStep()} />)
    expect(screen.getByText('recorder.traceDetail.timestamp')).toBeInTheDocument()
  })

  it('renders element info when provided', () => {
    const step = makeStep({
      elementInfo: {
        tagName: 'BUTTON',
        selector: '#submit-btn',
        strategy: 'id',
        innerText: 'Submit'
      }
    })
    render(<TraceDetailPanel step={step} />)
    expect(screen.getByText('recorder.traceDetail.elementInfo')).toBeInTheDocument()
    expect(screen.getByText('<button>')).toBeInTheDocument()
    expect(screen.getByText('id')).toBeInTheDocument()
    expect(screen.getByText('#submit-btn')).toBeInTheDocument()
    expect(screen.getByText('Submit')).toBeInTheDocument()
  })

  it('does not render element info section when not provided', () => {
    render(<TraceDetailPanel step={makeStep()} />)
    expect(screen.queryByText('recorder.traceDetail.elementInfo')).not.toBeInTheDocument()
  })

  it('renders bounding rect position when provided', () => {
    const step = makeStep({
      elementInfo: {
        tagName: 'DIV',
        selector: '.box',
        strategy: 'css',
        boundingRect: { x: 100.7, y: 200.3, width: 50, height: 30 }
      }
    })
    render(<TraceDetailPanel step={step} />)
    // x and y are rounded
    expect(screen.getByText(/101/)).toBeInTheDocument()
    expect(screen.getByText(/200/)).toBeInTheDocument()
    expect(screen.getByText(/50/)).toBeInTheDocument()
  })

  it('does not render innerText when not provided', () => {
    const step = makeStep({
      elementInfo: {
        tagName: 'INPUT',
        selector: '#email',
        strategy: 'id'
      }
    })
    render(<TraceDetailPanel step={step} />)
    expect(screen.queryByText('Text:')).not.toBeInTheDocument()
  })

  it('shows loading state for screenshot', () => {
    render(<TraceDetailPanel step={makeStep({ screenshotPath: '/path/shot.png' })} />)
    expect(screen.getByText('Loading screenshot...')).toBeInTheDocument()
  })

  it('loads and displays screenshot', async () => {
    mockApi.readImage.mockResolvedValue({
      success: true,
      data: 'imgdata',
      fileExt: 'jpeg'
    })

    await act(async () => {
      render(<TraceDetailPanel step={makeStep({ screenshotPath: '/path/shot.jpg' })} />)
    })

    expect(mockApi.readImage).toHaveBeenCalledWith('/path/shot.jpg')
    const img = screen.getByAltText('Step screenshot')
    expect(img.getAttribute('src')).toContain('data:image/jpeg;base64,imgdata')
  })

  it('does not render screenshot section when no screenshotPath', () => {
    render(<TraceDetailPanel step={makeStep()} />)
    expect(screen.queryByAltText('Step screenshot')).not.toBeInTheDocument()
    expect(screen.queryByText('Loading screenshot...')).not.toBeInTheDocument()
  })
})
