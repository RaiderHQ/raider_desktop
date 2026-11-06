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

const keyboard = (): void => {
  fireEvent.keyDown(window, { key: 'Tab' })
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
    keyboard()
    fireEvent.focus(button)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Save this file')
    fireEvent.blur(button)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('hides on Esc and keeps focus', () => {
    const { button, wrapper } = setup()
    keyboard()
    act(() => button.focus())
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    fireEvent.keyDown(wrapper, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).toBeNull()
    expect(document.activeElement).toBe(button)
  })

  it('sets aria-describedby only while visible', () => {
    const { button } = setup()
    expect(button).not.toHaveAttribute('aria-describedby')
    keyboard()
    fireEvent.focus(button)
    expect(button).toHaveAttribute('aria-describedby', screen.getByRole('tooltip').id)
    fireEvent.blur(button)
    expect(button).not.toHaveAttribute('aria-describedby')
  })

  it('merges with an existing aria-describedby on the child', () => {
    render(
      <Tooltip content="Tip">
        <button aria-describedby="msg">Go</button>
      </Tooltip>
    )
    const button = screen.getByText('Go')
    keyboard()
    fireEvent.focus(button)
    expect(button.getAttribute('aria-describedby')).toBe(`msg ${screen.getByRole('tooltip').id}`)
  })

  it('does not show on a mouse-driven focus', () => {
    const { button } = setup()
    fireEvent.pointerDown(button)
    fireEvent.focus(button)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('shows on a keyboard-driven focus', () => {
    const { button } = setup()
    keyboard()
    fireEvent.focus(button)
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
  })

  it('hides on pointerdown', () => {
    const { button, wrapper } = setup()
    keyboard()
    fireEvent.focus(button)
    fireEvent.pointerDown(wrapper)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('hides on scroll', () => {
    const { button } = setup()
    keyboard()
    fireEvent.focus(button)
    fireEvent.scroll(window)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('renders the platform label in the chip', () => {
    Object.defineProperty(navigator, 'platform', { value: 'MacIntel', configurable: true })
    const { button, unmount } = setup({ shortcut: 'save' })
    keyboard()
    fireEvent.focus(button)
    expect(screen.getByRole('tooltip').querySelector('kbd')).toHaveTextContent('⌘S')
    unmount()
    Object.defineProperty(navigator, 'platform', { value: 'Win32', configurable: true })
    const second = setup({ shortcut: 'save' })
    keyboard()
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
    keyboard()
    fireEvent.focus(button)
    fireEvent.mouseEnter(button.parentElement as HTMLElement)
    unmount()
    expect(screen.queryByRole('tooltip')).toBeNull()
    expect(() => vi.advanceTimersByTime(1000)).not.toThrow()
  })
})
