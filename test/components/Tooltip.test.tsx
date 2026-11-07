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

describe('Tooltip placement', () => {
  const margin = 8
  const bubble = { width: 260, height: 40 }

  // jsdom lays nothing out: the trigger and the bubble get the rects a real window would give
  const layout = (trigger: Partial<DOMRect>, viewport = { width: 1024, height: 700 }): void => {
    Object.defineProperty(window, 'innerWidth', { value: viewport.width, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: viewport.height, configurable: true })
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element
    ) {
      const base = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }
      if (this.getAttribute('role') === 'tooltip') {
        const left = parseFloat((this as HTMLElement).style.left) || 0
        const top = parseFloat((this as HTMLElement).style.top) || 0
        return {
          ...base,
          ...bubble,
          left,
          top,
          right: left + bubble.width,
          bottom: top + bubble.height,
          toJSON: () => ({})
        } as DOMRect
      }
      const r = { ...base, width: 80, height: 28, ...trigger }
      return {
        ...r,
        right: r.left + r.width,
        bottom: r.top + r.height,
        toJSON: () => ({})
      } as DOMRect
    })
  }

  const shown = (position: React.ComponentProps<typeof Tooltip>['position']): HTMLElement => {
    const { button } = setup({ position })
    keyboard()
    fireEvent.focus(button)
    return screen.getByRole('tooltip')
  }

  const box = (tip: HTMLElement): { left: number; top: number; right: number; bottom: number } => {
    const left = parseFloat(tip.style.left)
    const top = parseFloat(tip.style.top)
    return { left, top, right: left + bubble.width, bottom: top + bubble.height }
  }

  it('a left tooltip near the left edge stays inside the window', () => {
    layout({ left: 12, top: 100 })
    const b = box(shown('left'))
    expect(b.left).toBeGreaterThanOrEqual(margin)
    expect(b.right).toBeLessThanOrEqual(window.innerWidth - margin)
  })

  it('a bottom tooltip near the left edge shifts right instead of centring off screen', () => {
    layout({ left: 4, top: 100 })
    const b = box(shown('bottom'))
    expect(b.left).toBeGreaterThanOrEqual(margin)
    expect(b.top).toBeGreaterThanOrEqual(128)
  })

  it('a right tooltip near the right edge flips to the left', () => {
    layout({ left: 1024 - 90, top: 100 })
    const b = box(shown('right'))
    expect(b.right).toBeLessThanOrEqual(window.innerWidth - margin)
    expect(b.right).toBeLessThanOrEqual(1024 - 90)
  })

  it('a top tooltip near the top edge flips below the trigger', () => {
    layout({ left: 300, top: 10 })
    const b = box(shown('top'))
    expect(b.top).toBeGreaterThanOrEqual(10 + 28)
    expect(b.top).toBeGreaterThanOrEqual(margin)
  })

  it('a bottom tooltip near the bottom edge flips above the trigger', () => {
    layout({ left: 300, top: 700 - 30 })
    const b = box(shown('bottom'))
    expect(b.bottom).toBeLessThanOrEqual(700 - 30)
    expect(b.bottom).toBeLessThanOrEqual(window.innerHeight - margin)
  })

  it('shows the detail line under the content', () => {
    layout({ left: 300, top: 100 })
    render(
      <Tooltip content="Switch project" detail="/Users/me/shop">
        <button>shop</button>
      </Tooltip>
    )
    keyboard()
    fireEvent.focus(screen.getByText('shop'))
    expect(screen.getByRole('tooltip')).toHaveTextContent('Switch project')
    expect(screen.getByRole('tooltip')).toHaveTextContent('/Users/me/shop')
  })
})
