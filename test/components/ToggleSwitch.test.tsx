import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { vi } from 'vitest'
import ToggleSwitch from '@components/ToggleSwitch'

describe('ToggleSwitch', () => {
  it('is a switch named by its label', () => {
    render(<ToggleSwitch label="Headless" checked={false} onChange={vi.fn()} />)
    const toggle = screen.getByRole('switch', { name: 'Headless' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
  })

  it('reads its description to assistive tech', () => {
    render(
      <ToggleSwitch
        label="Run in parallel"
        checked
        onChange={vi.fn()}
        description="Uses 2 workers"
      />
    )
    expect(screen.getByRole('switch', { name: 'Run in parallel' })).toHaveAccessibleDescription(
      'Uses 2 workers'
    )
  })

  it('flips on click', () => {
    const onChange = vi.fn()
    render(<ToggleSwitch label="Headless" checked={false} onChange={onChange} />)
    fireEvent.click(screen.getByRole('switch', { name: 'Headless' }))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('toggles when its label text is clicked', () => {
    const onChange = vi.fn()
    render(<ToggleSwitch label="Headless" checked={false} onChange={onChange} />)
    fireEvent.click(screen.getByText('Headless'))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('never submits a form around it', () => {
    render(<ToggleSwitch label="Headless" checked={false} onChange={vi.fn()} />)
    expect(screen.getByRole('switch')).toHaveAttribute('type', 'button')
  })
})
