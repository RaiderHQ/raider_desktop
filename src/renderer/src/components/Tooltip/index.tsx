import React from 'react'

interface TooltipProps {
  content: string
  children: React.ReactNode
  position?: 'top' | 'bottom'
  className?: string
}

const Tooltip: React.FC<TooltipProps> = ({ content, children, position = 'top', className = '' }) => {
  const bubbleBase =
    'absolute z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 delay-500 bg-neutral-dark text-white text-xs px-2.5 py-1.5 rounded shadow-elevated max-w-[220px] w-max whitespace-normal text-center leading-snug'

  const positionClasses =
    position === 'top'
      ? 'bottom-full mb-2 left-1/2 -translate-x-1/2'
      : 'top-full mt-2 left-1/2 -translate-x-1/2'

  return (
    <span className={`group relative inline-flex items-center ${className}`}>
      {children}
      <span className={`${bubbleBase} ${positionClasses}`}>{content}</span>
    </span>
  )
}

export default Tooltip
