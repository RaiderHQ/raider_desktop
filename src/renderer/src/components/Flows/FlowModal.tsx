import React, { useEffect, useId } from 'react'
import ReactDOM from 'react-dom'

interface FlowModalProps {
  title: string
  onClose: () => void
  children: React.ReactNode
  footer: React.ReactNode
}

/** The frame the Flows tab's dialogs share: overlay, title, body, footer; Esc closes. */
const FlowModal: React.FC<FlowModalProps> = ({ title, onClose, children, footer }) => {
  const titleId = useId()
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return (): void => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-white rounded-xl shadow-elevated w-full max-w-md max-h-[90vh] flex flex-col"
      >
        <div className="px-6 py-4 border-b border-neutral-bdr">
          <h2 id={titleId} className="text-lg font-semibold text-neutral-dark break-words">
            {title}
          </h2>
        </div>
        <div className="px-6 py-4 space-y-4 overflow-y-auto">{children}</div>
        <div className="border-t border-neutral-bdr px-6 py-4 flex justify-end space-x-2">
          {footer}
        </div>
      </div>
    </div>,
    document.body
  )
}

export default FlowModal
