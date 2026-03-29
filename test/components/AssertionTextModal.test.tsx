import { render, screen, fireEvent, act } from '@testing-library/react'
import AssertionTextModal from '@components/AssertionTextModal'
import '@testing-library/jest-dom'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

describe('AssertionTextModal', () => {
  const defaultProps = {
    initialText: '',
    onSave: vi.fn(),
    onClose: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the title, message and label', () => {
    render(<AssertionTextModal {...defaultProps} />)
    expect(screen.getByText('recorder.assertionTextModal.titles.text')).toBeInTheDocument()
    expect(screen.getByText('recorder.assertionTextModal.messages.text')).toBeInTheDocument()
  })

  it('populates input with initialText', () => {
    render(<AssertionTextModal {...defaultProps} initialText="hello" />)
    expect(screen.getByRole('textbox')).toHaveValue('hello')
  })

  it('updates value when user types', () => {
    render(<AssertionTextModal {...defaultProps} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'expected text' } })
    expect(input).toHaveValue('expected text')
  })

  it('calls onSave with the current text when Save is clicked', () => {
    const onSave = vi.fn()
    render(<AssertionTextModal {...defaultProps} onSave={onSave} initialText="foo" />)
    fireEvent.click(screen.getByText('recorder.assertionTextModal.save'))
    expect(onSave).toHaveBeenCalledWith('foo')
  })

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn()
    render(<AssertionTextModal {...defaultProps} onClose={onClose} />)
    fireEvent.click(screen.getByText('recorder.assertionTextModal.cancel'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onSave when Enter key is pressed in the input', async () => {
    const onSave = vi.fn()
    render(<AssertionTextModal {...defaultProps} onSave={onSave} initialText="value" />)
    const input = screen.getByRole('textbox')
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' })
    })
    expect(onSave).toHaveBeenCalledWith('value')
  })

  it('renders text-includes title when assertionType is text-includes', () => {
    render(<AssertionTextModal {...defaultProps} assertionType="text-includes" />)
    expect(
      screen.getByText('recorder.assertionTextModal.titles.text-includes')
    ).toBeInTheDocument()
    expect(
      screen.getByText('recorder.assertionTextModal.messages.text-includes')
    ).toBeInTheDocument()
  })

  it('renders value title when assertionType is value', () => {
    render(<AssertionTextModal {...defaultProps} assertionType="value" />)
    expect(
      screen.getByText('recorder.assertionTextModal.titles.value')
    ).toBeInTheDocument()
    expect(
      screen.getByText('recorder.assertionTextModal.messages.value')
    ).toBeInTheDocument()
  })

  it('renders page-title title when assertionType is page-title', () => {
    render(<AssertionTextModal {...defaultProps} assertionType="page-title" />)
    expect(
      screen.getByText('recorder.assertionTextModal.titles.page-title')
    ).toBeInTheDocument()
    expect(
      screen.getByText('recorder.assertionTextModal.messages.page-title')
    ).toBeInTheDocument()
  })

  it('renders page-url title when assertionType is page-url', () => {
    render(<AssertionTextModal {...defaultProps} assertionType="page-url" />)
    expect(
      screen.getByText('recorder.assertionTextModal.titles.page-url')
    ).toBeInTheDocument()
    expect(
      screen.getByText('recorder.assertionTextModal.messages.page-url')
    ).toBeInTheDocument()
  })

  it('calls onClose when clicking the overlay', () => {
    const onClose = vi.fn()
    render(<AssertionTextModal {...defaultProps} onClose={onClose} />)
    const overlay = document.getElementById('assertion-modal-overlay')!
    fireEvent.click(overlay)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does NOT call onClose when clicking modal content', () => {
    const onClose = vi.fn()
    render(<AssertionTextModal {...defaultProps} onClose={onClose} />)
    const title = screen.getByText('recorder.assertionTextModal.titles.text')
    fireEvent.click(title)
    expect(onClose).not.toHaveBeenCalled()
  })
})
