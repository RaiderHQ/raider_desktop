import { render, screen, fireEvent, act } from '@testing-library/react'
import Tooltip from '@components/Tooltip'

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

type Setup = ReturnType<typeof render> & { button: HTMLElement; wrapper: HTMLElement }

const setup = (props: Partial<React.ComponentProps<typeof Tooltip>> = {}): Setup => {
  const utils = render(
    <Tooltip content="Save this file" {...props}>
      <button>Save</button>
    </Tooltip>
  )
  const button = screen.getByText('Save')
  return { ...utils, button, wrapper: button.parentElement as HTMLElement }
}

describe('Tooltip', () => {
  it('shows on hover after 500 ms', () => {
    const { wrapper } = setup()
    fireEvent.mouseEnter(wrapper)
    expect(screen.queryByRole('tooltip')).toBeNull()
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(screen.getByRole('tooltip')).toHaveTextContent('Save this file')
  })

  it('shows on focus at once and hides on blur', () => {
    const { button } = setup()
    fireEvent.focus(button)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Save this file')
    fireEvent.blur(button)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('hides on Esc and keeps focus', () => {
    const { button, wrapper } = setup()
    act(() => button.focus())
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    fireEvent.keyDown(wrapper, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).toBeNull()
    expect(document.activeElement).toBe(button)
  })

  it('sets aria-describedby only while visible', () => {
    const { button, wrapper } = setup()
    expect(wrapper).not.toHaveAttribute('aria-describedby')
    fireEvent.focus(button)
    expect(wrapper).toHaveAttribute('aria-describedby', screen.getByRole('tooltip').id)
    fireEvent.blur(button)
    expect(wrapper).not.toHaveAttribute('aria-describedby')
  })

  it('renders the platform label in the chip', () => {
    Object.defineProperty(navigator, 'platform', { value: 'MacIntel', configurable: true })
    const { button, unmount } = setup({ shortcut: 'save' })
    fireEvent.focus(button)
    expect(screen.getByRole('tooltip').querySelector('kbd')).toHaveTextContent('⌘S')
    unmount()
    Object.defineProperty(navigator, 'platform', { value: 'Win32', configurable: true })
    const second = setup({ shortcut: 'save' })
    fireEvent.focus(second.button)
    expect(screen.getByRole('tooltip').querySelector('kbd')).toHaveTextContent('Ctrl+S')
  })

  it('shows the disabled reason over a disabled child', () => {
    render(
      <Tooltip content="Run" disabledReason="Save this test to run it" shortcut="run">
        <button disabled>Run</button>
      </Tooltip>
    )
    fireEvent.mouseEnter(screen.getByText('Run').parentElement as HTMLElement)
    act(() => {
      vi.advanceTimersByTime(500)
    })
    const tip = screen.getByRole('tooltip')
    expect(tip).toHaveTextContent('Save this test to run it')
    expect(tip.querySelector('kbd')).toBeNull()
  })

  it('removes the bubble on unmount', () => {
    const { button, unmount } = setup()
    fireEvent.focus(button)
    fireEvent.mouseEnter(button.parentElement as HTMLElement)
    unmount()
    expect(screen.queryByRole('tooltip')).toBeNull()
    expect(() => vi.advanceTimersByTime(1000)).not.toThrow()
  })
})
