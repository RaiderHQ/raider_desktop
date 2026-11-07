import React, { useState, useRef, useEffect, useId, isValidElement, cloneElement } from 'react'
import ReactDOM from 'react-dom'
import { shortcutLabel, platformFrom } from '@shared/shortcuts'
import type { ShortcutId } from '@shared/shortcuts'

interface TooltipProps {
  content: string
  /** Shown instead of content while truthy (a disabled control's reason) */
  disabledReason?: string
  /** Appended as a kbd chip, from the shared table; never typed into content */
  shortcut?: ShortcutId
  children: React.ReactNode
  position?: 'top' | 'bottom' | 'right' | 'left'
  className?: string
}

// True while the last input was the keyboard; a mouse click or autoFocus must not pop the bubble
let keyboardModality = false
let modalityInstalled = false
const installModality = (): void => {
  if (modalityInstalled || typeof window === 'undefined') return
  modalityInstalled = true
  window.addEventListener('keydown', () => (keyboardModality = true), true)
  window.addEventListener('pointerdown', () => (keyboardModality = false), true)
}
installModality()

const Tooltip: React.FC<TooltipProps> = ({
  content,
  disabledReason,
  shortcut,
  children,
  position = 'right',
  className = ''
}) => {
  const [visible, setVisible] = useState(false)
  const [style, setStyle] = useState<React.CSSProperties>({})
  const triggerRef = useRef<HTMLSpanElement>(null)
  const id = useId()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const calcStyle = (): React.CSSProperties => {
    if (!triggerRef.current) return {}
    const rect = triggerRef.current.getBoundingClientRect()
    const gap = 8
    const base: React.CSSProperties = {
      position: 'fixed',
      zIndex: 9999,
      maxWidth: 260,
      pointerEvents: 'none'
    }
    if (position === 'right') {
      return {
        ...base,
        top: rect.top + rect.height / 2,
        left: rect.right + gap,
        transform: 'translateY(-50%)'
      }
    }
    if (position === 'left') {
      return {
        ...base,
        top: rect.top + rect.height / 2,
        right: window.innerWidth - rect.left + gap,
        transform: 'translateY(-50%)'
      }
    }
    if (position === 'top') {
      return {
        ...base,
        bottom: window.innerHeight - rect.top + gap,
        left: rect.left + rect.width / 2,
        transform: 'translateX(-50%)'
      }
    }
    // bottom
    return {
      ...base,
      top: rect.bottom + gap,
      left: rect.left + rect.width / 2,
      transform: 'translateX(-50%)'
    }
  }

  const reveal = (): void => {
    setStyle(calcStyle())
    setVisible(true)
  }

  const show = (): void => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(reveal, 500)
  }

  const showNow = (): void => {
    if (timerRef.current) clearTimeout(timerRef.current)
    reveal()
  }

  const hide = (): void => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setVisible(false)
  }

  useEffect(() => {
    if (!visible) return undefined
    window.addEventListener('scroll', hide, true)
    window.addEventListener('resize', hide)
    return (): void => {
      window.removeEventListener('scroll', hide, true)
      window.removeEventListener('resize', hide)
    }
  }, [visible])

  useEffect(
    () => (): void => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    []
  )

  const describedBy = visible ? id : undefined
  const single = isValidElement(children) ? (children as React.ReactElement) : null
  let content_: React.ReactNode = children
  if (single && describedBy) {
    const existing = (single.props as { 'aria-describedby'?: string })['aria-describedby']
    content_ = cloneElement(single, {
      'aria-describedby': existing ? `${existing} ${describedBy}` : describedBy
    } as Record<string, unknown>)
  }

  return (
    <span
      ref={triggerRef}
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={(): void => {
        if (keyboardModality) showNow()
      }}
      onPointerDown={hide}
      onBlur={hide}
      onKeyDown={(e): void => {
        if (e.key === 'Escape') hide()
      }}
      aria-describedby={single ? undefined : describedBy}
    >
      {content_}
      {visible &&
        ReactDOM.createPortal(
          <span
            id={id}
            role="tooltip"
            style={style}
            className="pointer-events-none bg-neutral-dark text-white text-xs px-2.5 py-1.5 rounded shadow-elevated leading-snug whitespace-normal text-center"
          >
            {disabledReason || content}
            {shortcut && !disabledReason && (
              <kbd className="ml-1.5 px-1 rounded bg-white/15 font-sans">
                {shortcutLabel(shortcut, platformFrom(navigator.platform))}
              </kbd>
            )}
          </span>,
          document.body
        )}
    </span>
  )
}

export default Tooltip
