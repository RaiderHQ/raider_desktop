import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { vi } from 'vitest'
import CodeViewToggle from '@components/CodeViewToggle'

vi.mock('react-i18next', () => ({
  useTranslation: (): { t: (key: string) => string } => ({ t: (key: string): string => key })
}))

describe('CodeViewToggle', () => {
  it('is a two-segment group with the pressed segment marked', () => {
    render(<CodeViewToggle view="steps" onChange={vi.fn()} />)
    expect(screen.getByRole('group', { name: 'testPage.view' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'testPage.steps' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(screen.getByRole('button', { name: 'testPage.ruby' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
  })

  it('shows a tooltip on focus for the Ruby segment', () => {
    render(<CodeViewToggle view="steps" onChange={vi.fn()} />)
    fireEvent.focus(screen.getByRole('button', { name: 'testPage.ruby' }))
    expect(screen.getByRole('tooltip')).toHaveTextContent('tooltips.testPage.ruby')
  })

  it('reports the segment that was chosen', () => {
    const onChange = vi.fn()
    render(<CodeViewToggle view="steps" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'testPage.ruby' }))
    expect(onChange).toHaveBeenCalledWith('ruby')
  })

  it('keeps Steps enabled but explains when it is not available', () => {
    const onChange = vi.fn()
    render(<CodeViewToggle view="ruby" onChange={onChange} stepsUnavailableReason="no steps" />)
    const steps = screen.getByRole('button', { name: 'testPage.steps' })
    expect(steps).toBeEnabled()
    expect(steps).toHaveAttribute('aria-disabled', 'true')
    expect(steps).toHaveAttribute('title', 'no steps')
    fireEvent.click(steps)
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'testPage.ruby' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })
})
