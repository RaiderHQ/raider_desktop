import { render, screen, fireEvent } from '@testing-library/react'
import Button from '@components/Button'
import '@testing-library/jest-dom'

describe('Button', () => {
  it('renders children', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByText('Click me')).toBeInTheDocument()
  })

  it('applies primary styles by default', () => {
    render(<Button>Primary</Button>)
    expect(screen.getByRole('button')).toHaveClass('bg-ruby')
  })

  it('applies secondary styles', () => {
    render(<Button type="secondary">Secondary</Button>)
    expect(screen.getByRole('button')).toHaveClass('bg-ruby-sub')
  })

  it('applies success styles', () => {
    render(<Button type="success">Success</Button>)
    expect(screen.getByRole('button')).toHaveClass('bg-status-ok')
  })

  it('applies disabled styles when disabled prop is true', () => {
    render(<Button disabled>Disabled</Button>)
    expect(screen.getByRole('button')).toHaveClass('bg-neutral-bdr')
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('calls onClick when clicked', () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Click</Button>)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('does not call onClick when disabled', () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick} disabled>Click</Button>)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('passes extra className to button', () => {
    render(<Button className="extra-class">Button</Button>)
    expect(screen.getByRole('button')).toHaveClass('extra-class')
  })
})
