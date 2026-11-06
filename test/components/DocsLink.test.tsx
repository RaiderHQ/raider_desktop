import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { vi } from 'vitest'
import DocsLink from '@components/DocsLink'

vi.mock('react-i18next', () => ({
  useTranslation: (): { t: (key: string, opts?: object) => string } => ({
    t: (key: string, opts?: object): string => (opts ? `${key} ${JSON.stringify(opts)}` : key)
  })
}))

beforeEach(() => {
  ;(window as unknown as Record<string, unknown>).api = {
    openDocs: vi.fn().mockResolvedValue({ success: true })
  }
})

describe('DocsLink', () => {
  it('is a button with an accessible name', () => {
    render(<DocsLink id="docs.recorder" topic="recording" />)
    const button = screen.getByRole('button', {
      name: 'docs.learnMoreAbout {"topic":"recording"}'
    })
    expect(button).toHaveAttribute('type', 'button')
    expect(button).toHaveTextContent('docs.learnMore')
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('opens its id', () => {
    render(
      <DocsLink id="docs.running" topic="runs">
        How runs work
      </DocsLink>
    )
    fireEvent.click(screen.getByText('How runs work'))
    expect(window.api.openDocs).toHaveBeenCalledWith('docs.running')
  })

  it('the xs size renders text-xs and not text-sm', () => {
    render(<DocsLink id="docs.home" topic="x" size="xs" />)
    const button = screen.getByRole('button')
    expect(button).toHaveClass('text-xs')
    expect(button).not.toHaveClass('text-sm')
  })
})
