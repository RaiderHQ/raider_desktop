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

describe('InputField accessibility', () => {
  it('ties the label to the input', () => {
    render(<InputField id="project-name" label="Project name" value="" onChange={vi.fn()} />)
    expect(screen.getByLabelText('Project name')).toBe(screen.getByRole('textbox'))
  })

  it('describes the input with its hint', () => {
    render(<InputField id="n" value="" onChange={vi.fn()} hint="Letters and numbers" />)
    expect(screen.getByRole('textbox')).toHaveAccessibleDescription('Letters and numbers')
    expect(screen.getByRole('textbox')).not.toHaveAttribute('aria-invalid', 'true')
  })

  it('marks the input invalid and announces the error', () => {
    render(<InputField id="n" value="a b" onChange={vi.fn()} error="No spaces" />)
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('textbox')).toHaveAccessibleDescription('No spaces')
    expect(screen.getByRole('alert')).toHaveTextContent('No spaces')
  })

  it('shows a tooltip on focus only when one is given', () => {
    const { unmount } = render(<InputField label="X" value="" onChange={vi.fn()} tooltip="Hello" />)
    fireEvent.focus(screen.getByLabelText('X'))
    expect(screen.getByRole('tooltip')).toHaveTextContent('Hello')
    unmount()
    render(<InputField label="X" value="" onChange={vi.fn()} />)
    fireEvent.focus(screen.getByLabelText('X'))
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
})
