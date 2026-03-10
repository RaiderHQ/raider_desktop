import { render, screen, fireEvent } from '@testing-library/react'
import ConfirmationModal from '@components/ConfirmationModal'
import '@testing-library/jest-dom'

describe('ConfirmationModal', () => {
  it('renders the message', () => {
    render(
      <ConfirmationModal message="Are you sure?" onConfirm={vi.fn()} onCancel={vi.fn()} />
    )
    expect(screen.getByText('Are you sure?')).toBeInTheDocument()
  })

  it('renders Confirm and Cancel buttons', () => {
    render(
      <ConfirmationModal message="Continue?" onConfirm={vi.fn()} onCancel={vi.fn()} />
    )
    expect(screen.getByText('Confirm')).toBeInTheDocument()
    expect(screen.getByText('Cancel')).toBeInTheDocument()
  })

  it('calls onConfirm when Confirm is clicked', () => {
    const onConfirm = vi.fn()
    render(
      <ConfirmationModal message="Continue?" onConfirm={onConfirm} onCancel={vi.fn()} />
    )
    fireEvent.click(screen.getByText('Confirm'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = vi.fn()
    render(
      <ConfirmationModal message="Continue?" onConfirm={vi.fn()} onCancel={onCancel} />
    )
    fireEvent.click(screen.getByText('Cancel'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
