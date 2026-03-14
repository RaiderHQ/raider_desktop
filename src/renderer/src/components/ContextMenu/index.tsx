import React, { useEffect, useRef } from 'react'

interface ContextMenuItem {
  label: string
  onClick: () => void
  disabled?: boolean
}

interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null)

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
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white border border-neutral-bdr rounded-md shadow-lg py-1 min-w-[200px]"
      style={{ left: x, top: y }}
    >
      {items.map((item, index) => (
        <button
          key={index}
          onClick={() => {
            item.onClick()
            onClose()
          }}
          disabled={item.disabled}
          className="w-full text-left px-3 py-1.5 text-sm text-neutral-dk hover:bg-ruby-sub hover:text-ruby transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

export default ContextMenu
