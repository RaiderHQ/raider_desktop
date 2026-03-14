import { render, screen, fireEvent, act } from '@testing-library/react'
import TestResultCard from '@components/TestResultCard'
import '@testing-library/jest-dom'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

vi.mock('react-hot-toast', () => ({ default: { error: vi.fn() } }))

beforeEach(() => {
  window.api = { readImage: vi.fn().mockResolvedValue({ success: true, data: 'base64data' }) } as any
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

})
