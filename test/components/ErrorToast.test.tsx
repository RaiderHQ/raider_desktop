import { render, screen, fireEvent, act } from '@testing-library/react'
import toast, { Toaster } from 'react-hot-toast'
import '@testing-library/jest-dom'
import { showErrorToast } from '@foundation/errorToast'
import '@foundation/Translation/Backend'

// react-hot-toast's Toaster asks for prefers-reduced-motion, which jsdom lacks
beforeAll(() => {
  window.matchMedia = (): MediaQueryList =>
    ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }) as never
})

const TRACE = ['/gems/thor/lib/thor.rb:3: invalid multibyte char (US-ASCII) (SyntaxError)']
  .concat(Array.from({ length: 30 }, (_, i) => `  from /gems/frame_${i}.rb:${i}:in 'block'`))
  .join('\n')

describe('showErrorToast', () => {
  // Toasts live in a module-wide store and this one never expires on its own
  beforeEach(() => toast.remove())

  it('shows one line and keeps the stack trace behind "Show details"', async () => {
    render(<Toaster />)
    await act(async () => {
      showErrorToast("Raider couldn't create the project.", TRACE)
    })
    expect(screen.getByText("Raider couldn't create the project.")).toBeInTheDocument()
    expect(screen.queryByText(/invalid multibyte char/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show details' }))
    expect(screen.getByText(/invalid multibyte char/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hide details' })).toBeInTheDocument()
  })

  it('shows a short reason straight away, with no expander', async () => {
    render(<Toaster />)
    await act(async () => {
      showErrorToast(
        "Raider couldn't create the project.",
        'A folder named "shop" already exists in /tmp.'
      )
    })
    expect(screen.getByText('A folder named "shop" already exists in /tmp.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show details' })).not.toBeInTheDocument()
  })

  it('stays until dismissed', async () => {
    render(<Toaster />)
    await act(async () => {
      showErrorToast('Something failed.', TRACE)
    })
    const dismiss = screen.getByRole('button', { name: 'Dismiss' })
    fireEvent.click(dismiss)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1200))
    })
    expect(screen.queryByText('Something failed.')).not.toBeInTheDocument()
  })
})
