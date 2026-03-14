import { render, screen, fireEvent } from '@testing-library/react'
import InputField from '@components/InputField'
import '@testing-library/jest-dom'

describe('InputField', () => {
  it('renders with a label', () => {
    render(<InputField label="My Label" value="" onChange={vi.fn()} />)
    expect(screen.getByText('My Label')).toBeInTheDocument()
  })

  it('renders without a label when not provided', () => {
    const { container } = render(<InputField value="" onChange={vi.fn()} />)
    expect(container.querySelector('label')).toBeNull()
  })

  it('reflects the controlled value', () => {
    render(<InputField value="hello" onChange={vi.fn()} />)
    expect(screen.getByRole('textbox')).toHaveValue('hello')
  })

  it('calls onChange when the user types', () => {
    const onChange = vi.fn()
    render(<InputField value="" onChange={onChange} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'abc' } })
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('calls onKeyDown when a key is pressed', () => {
    const onKeyDown = vi.fn()
    render(<InputField value="" onChange={vi.fn()} onKeyDown={onKeyDown} />)
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
    expect(onKeyDown).toHaveBeenCalledTimes(1)
  })

  it('is disabled when disabled prop is true', () => {
    render(<InputField value="" onChange={vi.fn()} disabled />)
    expect(screen.getByRole('textbox')).toBeDisabled()
  })

  it('applies disabled styles when disabled', () => {
    render(<InputField value="" onChange={vi.fn()} disabled />)
    expect(screen.getByRole('textbox')).toHaveClass('bg-neutral-lt')
  })

  it('renders a placeholder', () => {
    render(<InputField value="" onChange={vi.fn()} placeholder="Enter text..." />)
    expect(screen.getByPlaceholderText('Enter text...')).toBeInTheDocument()
  })
})
