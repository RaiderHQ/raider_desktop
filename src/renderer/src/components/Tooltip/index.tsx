import React, { useState, useRef, useEffect } from 'react'
import ReactDOM from 'react-dom'

interface TooltipProps {
  content: string
  children: React.ReactNode
  position?: 'top' | 'bottom' | 'right' | 'left'
  className?: string
}

const Tooltip: React.FC<TooltipProps> = ({ content, children, position = 'right', className = '' }) => {
  const [visible, setVisible] = useState(false)
  const [style, setStyle] = useState<React.CSSProperties>({})
  const triggerRef = useRef<HTMLSpanElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const calcStyle = (): React.CSSProperties => {
    if (!triggerRef.current) return {}
    const rect = triggerRef.current.getBoundingClientRect()
    const gap = 8
    const base: React.CSSProperties = {
      position: 'fixed',
      zIndex: 9999,
      maxWidth: 220,
      pointerEvents: 'none'
    }
    if (position === 'right') {
      return { ...base, top: rect.top + rect.height / 2, left: rect.right + gap, transform: 'translateY(-50%)' }
    }
    if (position === 'left') {
      return { ...base, top: rect.top + rect.height / 2, right: window.innerWidth - rect.left + gap, transform: 'translateY(-50%)' }
    }
    if (position === 'top') {
      return { ...base, bottom: window.innerHeight - rect.top + gap, left: rect.left + rect.width / 2, transform: 'translateX(-50%)' }
    }
    // bottom
    return { ...base, top: rect.bottom + gap, left: rect.left + rect.width / 2, transform: 'translateX(-50%)' }
  }

  const show = (): void => {
    timerRef.current = setTimeout(() => {
      setStyle(calcStyle())
      setVisible(true)
    }, 500)
  }

  const hide = (): void => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setVisible(false)
  }

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  return (
    <span
      ref={triggerRef}
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      {children}
      {visible && ReactDOM.createPortal(
        <span
          style={style}
          className="bg-neutral-dark text-white text-xs px-2.5 py-1.5 rounded shadow-elevated leading-snug whitespace-normal text-center"
        >
          {content}
        </span>,
        document.body
      )}
    </span>
  )
}

export default Tooltip
