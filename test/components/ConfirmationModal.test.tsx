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
    const buttons = screen.getAllByRole('button')
    expect(buttons.some((b) => b.textContent === 'Confirm')).toBe(true)
    expect(buttons.some((b) => b.textContent === 'Cancel')).toBe(true)
  })

  it('calls onConfirm when Confirm is clicked', () => {
    const onConfirm = vi.fn()
    render(
      <ConfirmationModal message="Continue?" onConfirm={onConfirm} onCancel={vi.fn()} />
    )
    const confirmBtn = screen.getAllByRole('button').find((b) => b.textContent === 'Confirm')!
    fireEvent.click(confirmBtn)
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
