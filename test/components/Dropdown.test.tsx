import { render, screen, fireEvent } from '@testing-library/react'
import Dropdown from '@components/Dropdown'
import '@testing-library/jest-dom'

const makeOptions = (onClick = vi.fn()) => [
  { label: 'Option A', onClick },
  { label: 'Option B', onClick }
]

describe('Dropdown', () => {
  it('renders the button text', () => {
    render(<Dropdown buttonText="Actions" options={makeOptions()} />)
    expect(screen.getByText('Actions')).toBeInTheDocument()
  })

  it('does not show options initially', () => {
    render(<Dropdown buttonText="Actions" options={makeOptions()} />)
    expect(screen.queryByText('Option A')).not.toBeInTheDocument()
  })

  it('shows options when button is clicked', () => {
    render(<Dropdown buttonText="Actions" options={makeOptions()} />)
    fireEvent.click(screen.getByText('Actions'))
    expect(screen.getByText('Option A')).toBeInTheDocument()
    expect(screen.getByText('Option B')).toBeInTheDocument()
  })

  it('calls the option onClick and closes the menu', () => {
    const onClick = vi.fn()
    render(<Dropdown buttonText="Actions" options={makeOptions(onClick)} />)
    fireEvent.click(screen.getByText('Actions'))
    fireEvent.click(screen.getByText('Option A'))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Option A')).not.toBeInTheDocument()
  })

  it('does not open when disabled', () => {
    render(<Dropdown buttonText="Actions" options={makeOptions()} disabled />)
    fireEvent.click(screen.getByText('Actions'))
    expect(screen.queryByText('Option A')).not.toBeInTheDocument()
  })

  it('closes when clicking outside', () => {
    render(
      <div>
        <Dropdown buttonText="Actions" options={makeOptions()} />
        <div data-testid="outside">Outside</div>
      </div>
    )
    fireEvent.click(screen.getByText('Actions'))
    expect(screen.getByText('Option A')).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByTestId('outside'))
    expect(screen.queryByText('Option A')).not.toBeInTheDocument()
  })
})
