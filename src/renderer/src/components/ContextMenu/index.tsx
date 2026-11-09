import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom'

interface ContextMenuItem {
  label: string
  onClick: () => void
  disabled?: boolean
  /** Why the item is disabled, or what it does (shown on hover) */
  title?: string
  /** Starts a new group: a line above the item */
  separatorBefore?: boolean
}

interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

// Space kept between the menu and the window's edges
const EDGE = 8

/**
 * A right-click menu at (x, y). It renders at the end of the page, so no parent's layout
 * or transform can stretch or move it, is as wide as its longest item, and shifts to stay
 * inside the window. Arrow keys, Home and End move between enabled items; Escape closes.
 */
const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: x, top: y })

  useLayoutEffect(() => {
    const rect = menuRef.current?.getBoundingClientRect()
    if (!rect) return
    setPosition({
      left: Math.max(EDGE, Math.min(x, window.innerWidth - rect.width - EDGE)),
      top: Math.max(EDGE, Math.min(y, window.innerHeight - rect.height - EDGE))
    })
  }, [x, y])

  const enabledItems = (): HTMLButtonElement[] =>
    Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ??
        []
    )

  // Focus moves into the menu and goes back where it was (a list row, say) when the menu
  // closes, unless an item moved it somewhere else on purpose (a dialog's field)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const menu = menuRef.current
    enabledItems()[0]?.focus()
    return (): void => {
      const active = document.activeElement
      if (!active || active === document.body || menu?.contains(active)) previous?.focus?.()
    }
  }, [])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleEscape = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return (): void => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  const onKeyDown = (e: React.KeyboardEvent): void => {
    const all = enabledItems()
    if (all.length === 0) return
    const at = all.indexOf(document.activeElement as HTMLButtonElement)
    const next: Record<string, number> = {
      ArrowDown: (at + 1) % all.length,
      ArrowUp: (at - 1 + all.length) % all.length,
      Home: 0,
      End: all.length - 1
    }
    if (!(e.key in next)) return
    e.preventDefault()
    all[next[e.key]].focus()
  }

  return ReactDOM.createPortal(
    <div
      ref={menuRef}
      role="menu"
      onKeyDown={onKeyDown}
      className="fixed z-50 w-max max-w-xs bg-white border border-neutral-bdr rounded-md shadow-lg py-1 min-w-[200px]"
      style={{ left: position.left, top: position.top }}
    >
      {items.map((item, index) => (
        <React.Fragment key={index}>
          {item.separatorBefore && index > 0 && (
            <div role="separator" className="my-1 border-t border-neutral-bdr" />
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              item.onClick()
              onClose()
            }}
            disabled={item.disabled}
            title={item.title}
            className="block w-full text-left px-3 py-1.5 text-sm text-neutral-dk hover:bg-ruby-sub hover:text-ruby focus:bg-ruby-sub focus:text-ruby focus:outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {item.label}
          </button>
        </React.Fragment>
      ))}
    </div>,
    document.body
  )
}

export default ContextMenu
