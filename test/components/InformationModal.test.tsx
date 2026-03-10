import { render, screen, fireEvent } from '@testing-library/react'
import InformationModal from '@components/InformationModal'
import '@testing-library/jest-dom'

// createPortal renders into #root — provide it in the DOM
beforeEach(() => {
  const root = document.createElement('div')
  root.id = 'root'
  document.body.appendChild(root)
})

afterEach(() => {
  document.getElementById('root')?.remove()
})

describe('InformationModal', () => {
  it('renders the title and message', () => {
    render(
      <InformationModal title="Hello Title" message="Hello message" onClose={vi.fn()} />
    )
    expect(screen.getByText('Hello Title')).toBeInTheDocument()
    expect(screen.getByText('Hello message')).toBeInTheDocument()
  })

  it('calls onClose when the × button is clicked', () => {
    const onClose = vi.fn()
    render(<InformationModal title="T" message="M" onClose={onClose} />)
    fireEvent.click(screen.getByLabelText('Close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when the overlay backdrop is clicked', () => {
    const onClose = vi.fn()
    render(<InformationModal title="T" message="M" onClose={onClose} />)
    // The overlay has id="modal-overlay"
    const overlay = document.getElementById('modal-overlay')!
    fireEvent.click(overlay)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not call onClose when the modal content is clicked', () => {
    const onClose = vi.fn()
    render(<InformationModal title="T" message="M" onClose={onClose} />)
    fireEvent.click(screen.getByText('M'))
    expect(onClose).not.toHaveBeenCalled()
  })
})
