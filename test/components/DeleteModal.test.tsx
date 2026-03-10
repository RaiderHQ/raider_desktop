import { render, screen, fireEvent } from '@testing-library/react'
import DeleteModal from '@components/DeleteModal'
import '@testing-library/jest-dom'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

describe('DeleteModal', () => {
  const defaultProps = {
    testName: 'My Test',
    onConfirm: vi.fn(),
    onCancel: vi.fn()
  }

  beforeEach(() => vi.clearAllMocks())

  it('renders the modal title', () => {
    render(<DeleteModal {...defaultProps} />)
    expect(screen.getByText('recorder.deleteModal.title')).toBeInTheDocument()
  })

  it('displays the test name in the message', () => {
    render(<DeleteModal {...defaultProps} />)
    expect(screen.getByText('My Test')).toBeInTheDocument()
  })

  it('calls onConfirm when delete button is clicked', () => {
    render(<DeleteModal {...defaultProps} />)
    fireEvent.click(screen.getByText('recorder.deleteModal.delete'))
    expect(defaultProps.onConfirm).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel when cancel button is clicked', () => {
    render(<DeleteModal {...defaultProps} />)
    fireEvent.click(screen.getByText('recorder.deleteModal.cancel'))
    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1)
  })
})
