import React from 'react'
import Button from '@components/Button'

interface ConfirmationModalProps {
  title?: string
  message: string
  onConfirm: () => void
  onCancel: () => void
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  title = 'Confirm',
  message,
  onConfirm,
  onCancel
}) => {
  const handleOutsideClick = (e: React.MouseEvent): void => {
    if ((e.target as HTMLElement).id === 'confirm-modal-overlay') {
      onCancel()
    }
  }

  return (
    <div
      id="confirm-modal-overlay"
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={handleOutsideClick}
    >
      <div
        className="bg-white rounded-xl shadow-elevated w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-bdr">
          <h2 className="text-lg font-semibold text-neutral-dark">{title}</h2>
        </div>

        {/* Body */}
        <div className="px-6 py-4">
          <p className="text-neutral-dk">{message}</p>
        </div>

        {/* Footer */}
        <div className="border-t border-neutral-bdr px-6 py-4 flex justify-end space-x-2">
          <Button onClick={onCancel} type="secondary">
            Cancel
          </Button>
          <Button onClick={onConfirm} type="danger">
            Confirm
          </Button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmationModal
