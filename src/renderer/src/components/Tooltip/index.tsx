import React, {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useId,
  isValidElement,
  cloneElement
} from 'react'
import ReactDOM from 'react-dom'
import { shortcutLabel, platformFrom } from '@shared/shortcuts'
import type { ShortcutId } from '@shared/shortcuts'

interface TooltipProps {
  content: string
  /** A muted second line under the content (a path, a file name) */
  detail?: string
  /** Shown instead of content while truthy (a disabled control's reason) */
  disabledReason?: string
  /** Appended as a kbd chip, from the shared table; never typed into content */
  shortcut?: ShortcutId
  children: React.ReactNode
  position?: Position
  className?: string
}

type Position = 'top' | 'bottom' | 'right' | 'left'

const GAP = 8
/** The bubble keeps this far from every window edge */
const MARGIN = 8
const MAX_WIDTH = 260

const opposite: Record<Position, Position> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left'
}

interface Size {
  width: number
  height: number
}

/** Where the bubble's top-left corner goes for a side, before any clamping */
const anchor = (side: Position, rect: DOMRect, tip: Size): { left: number; top: number } => {
  switch (side) {
    case 'right':
      return { left: rect.right + GAP, top: rect.top + rect.height / 2 - tip.height / 2 }
    case 'left':
      return { left: rect.left - GAP - tip.width, top: rect.top + rect.height / 2 - tip.height / 2 }
    case 'top':
      return { left: rect.left + rect.width / 2 - tip.width / 2, top: rect.top - GAP - tip.height }
    default:
      return { left: rect.left + rect.width / 2 - tip.width / 2, top: rect.bottom + GAP }
  }
}

const fits = (side: Position, rect: DOMRect, tip: Size, w: number, h: number): boolean => {
  const at = anchor(side, rect, tip)
  if (side === 'left' || side === 'right') {
    return at.left >= MARGIN && at.left + tip.width <= w - MARGIN
  }
  return at.top >= MARGIN && at.top + tip.height <= h - MARGIN
}

/**
 * The bubble's place for a trigger: the asked side, the opposite side when the asked one
 * runs off the window, then shifted so it stays MARGIN inside the window either way (V2)
 */
export const placeTooltip = (
  position: Position,
  rect: DOMRect,
  tip: Size,
  viewport: { width: number; height: number }
): { left: number; top: number } => {
  const { width: w, height: h } = viewport
  const side =
    !fits(position, rect, tip, w, h) && fits(opposite[position], rect, tip, w, h)
      ? opposite[position]
      : position
  const at = anchor(side, rect, tip)
  const clamp = (value: number, size: number, limit: number): number =>
    Math.max(MARGIN, Math.min(value, limit - MARGIN - size))
  return { left: clamp(at.left, tip.width, w), top: clamp(at.top, tip.height, h) }
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
  detail,
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

  const bubbleRef = useRef<HTMLSpanElement>(null)
  const visibleRef = useRef(false)
  visibleRef.current = visible

  const reveal = (): void => {
    // Already showing (focused, then hovered): it is placed; resetting would hide it for good
    if (visibleRef.current) return
    // Hidden until the layout effect has measured the bubble and placed it
    setStyle({
      position: 'fixed',
      zIndex: 9999,
      maxWidth: MAX_WIDTH,
      pointerEvents: 'none',
      visibility: 'hidden',
      left: 0,
      top: 0
    })
    setVisible(true)
  }

  // The bubble's own size decides where it fits, so it is placed once it exists
  useLayoutEffect(() => {
    if (!visible || !triggerRef.current || !bubbleRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    // Measured from the corner, so the old spot near the right edge cannot narrow the text
    bubbleRef.current.style.left = '0px'
    bubbleRef.current.style.top = '0px'
    const bubble = bubbleRef.current.getBoundingClientRect()
    const at = placeTooltip(
      position,
      rect,
      { width: bubble.width, height: bubble.height },
      { width: window.innerWidth, height: window.innerHeight }
    )
    setStyle({
      position: 'fixed',
      zIndex: 9999,
      maxWidth: MAX_WIDTH,
      pointerEvents: 'none',
      left: at.left,
      top: at.top
    })
  }, [visible, position, content, detail, disabledReason, shortcut])

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
            ref={bubbleRef}
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
            {detail && !disabledReason && (
              <span className="block mt-0.5 text-white/70 break-all">{detail}</span>
            )}
          </span>,
          document.body
        )}
    </span>
  )
}

export default Tooltip
