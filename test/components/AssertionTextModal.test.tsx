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
    expect(screen.getByText('recorder.assertionTextModal.title')).toBeInTheDocument()
    expect(screen.getByText('recorder.assertionTextModal.message')).toBeInTheDocument()
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
})
