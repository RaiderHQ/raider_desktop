import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { vi, describe, it, expect, afterEach } from 'vitest'
import ContextMenu from '@components/ContextMenu'

const items = (): { label: string; onClick: () => void; disabled?: boolean }[] => [
  { label: 'New file…', onClick: vi.fn() },
  { label: 'Paste', onClick: vi.fn(), disabled: true },
  { label: 'Delete', onClick: vi.fn() }
]

const size = (width: number, height: number): void => {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true })
}

afterEach(() => vi.restoreAllMocks())

describe('ContextMenu', () => {
  it('is a menu of menu items, rendered at the end of the page and as wide as its content', () => {
    render(
      <div data-testid="host">
        <ContextMenu x={10} y={20} items={items()} onClose={vi.fn()} />
      </div>
    )
    const menu = screen.getByRole('menu')
    expect(screen.getByTestId('host')).not.toContainElement(menu)
    expect(menu.parentElement).toBe(document.body)
    expect(menu).toHaveClass('w-max')
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual([
      'New file…',
      'Paste',
      'Delete'
    ])
    expect(screen.getByRole('menuitem', { name: 'Paste' })).toBeDisabled()
  })

  it('focuses the first item and moves with the arrow keys, skipping disabled ones', () => {
    render(<ContextMenu x={10} y={20} items={items()} onClose={vi.fn()} />)
    const [first, , last] = screen.getAllByRole('menuitem')
    expect(first).toHaveFocus()
    fireEvent.keyDown(first, { key: 'ArrowDown' })
    expect(last).toHaveFocus()
    fireEvent.keyDown(last, { key: 'ArrowDown' })
    expect(first).toHaveFocus()
    fireEvent.keyDown(first, { key: 'ArrowUp' })
    expect(last).toHaveFocus()
    fireEvent.keyDown(last, { key: 'Home' })
    expect(first).toHaveFocus()
    fireEvent.keyDown(first, { key: 'End' })
    expect(last).toHaveFocus()
  })

  it('runs an item and closes; Escape closes', () => {
    const list = items()
    const onClose = vi.fn()
    render(<ContextMenu x={10} y={20} items={list} onClose={onClose} />)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(list[2].onClick).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('stays inside the window near the bottom right corner', () => {
    size(800, 600)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 200,
      height: 300
    } as DOMRect)
    render(<ContextMenu x={750} y={550} items={items()} onClose={vi.fn()} />)
    const menu = screen.getByRole('menu')
    expect(menu.style.left).toBe('592px')
    expect(menu.style.top).toBe('292px')
  })

  it('keeps its place when it fits', () => {
    size(800, 600)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 200,
      height: 100
    } as DOMRect)
    render(<ContextMenu x={10} y={20} items={items()} onClose={vi.fn()} />)
    expect(screen.getByRole('menu').style.left).toBe('10px')
    expect(screen.getByRole('menu').style.top).toBe('20px')
  })

  it('gives focus back to where it was when it closes', () => {
    const { rerender } = render(
      <>
        <button>row</button>
        <ContextMenu x={10} y={20} items={[]} onClose={vi.fn()} />
      </>
    )
    rerender(<button>row</button>)
    // Empty menu: nothing took focus, and closing leaves the page as it was
    screen.getByRole('button', { name: 'row' }).focus()
    rerender(
      <>
        <button>row</button>
        <ContextMenu x={10} y={20} items={items()} onClose={vi.fn()} />
      </>
    )
    expect(screen.getAllByRole('menuitem')[0]).toHaveFocus()
    rerender(<button>row</button>)
    expect(screen.getByRole('button', { name: 'row' })).toHaveFocus()
  })

  it('leaves focus where an item moved it', () => {
    const { rerender } = render(
      <>
        <button>row</button>
        <input aria-label="field" />
      </>
    )
    screen.getByRole('button', { name: 'row' }).focus()
    rerender(
      <>
        <button>row</button>
        <input aria-label="field" />
        <ContextMenu x={10} y={20} items={items()} onClose={vi.fn()} />
      </>
    )
    screen.getByRole('textbox', { name: 'field' }).focus()
    rerender(
      <>
        <button>row</button>
        <input aria-label="field" />
      </>
    )
    expect(screen.getByRole('textbox', { name: 'field' })).toHaveFocus()
  })

  it('draws a line above an item that starts a group, never above the first', () => {
    render(
      <ContextMenu
        x={10}
        y={20}
        items={[
          { label: 'New file…', onClick: vi.fn(), separatorBefore: true },
          { label: 'New page object…', onClick: vi.fn(), separatorBefore: true },
          { label: 'Copy', onClick: vi.fn() }
        ]}
        onClose={vi.fn()}
      />
    )
    const separators = screen.getAllByRole('separator')
    expect(separators).toHaveLength(1)
    expect(separators[0].nextElementSibling).toHaveTextContent('New page object…')
    // Arrow keys still move between the items only
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' })
    expect(screen.getByRole('menuitem', { name: 'New page object…' })).toHaveFocus()
  })
})
