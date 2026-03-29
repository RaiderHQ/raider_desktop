import React from 'react'
import Button from '@components/Button'
import { useTranslation } from 'react-i18next'

interface DeleteModalProps {
  testName: string
  onConfirm: () => void
  onCancel: () => void
}

const DeleteModal: React.FC<DeleteModalProps> = ({ testName, onConfirm, onCancel }) => {
  const { t } = useTranslation()

  const handleOutsideClick = (e: React.MouseEvent): void => {
    if ((e.target as HTMLElement).id === 'delete-modal-overlay') {
      onCancel()
    }
  }

  return (
    <div
      id="delete-modal-overlay"
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={handleOutsideClick}
    >
      <div
        className="bg-white rounded-xl shadow-elevated w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-bdr">
          <h2 className="text-lg font-semibold text-neutral-dark">
            {t('recorder.deleteModal.title')}
          </h2>
        </div>

        {/* Body */}
        <div className="px-6 py-4">
          <p className="text-neutral-dk">
            {t('recorder.deleteModal.message')} <span className="font-bold">{testName}</span>?
          </p>
        </div>

        {/* Footer */}
        <div className="border-t border-neutral-bdr px-6 py-4 flex justify-end space-x-2">
          <Button onClick={onCancel} type="secondary">
            {t('recorder.deleteModal.cancel')}
          </Button>
          <Button onClick={onConfirm} type="danger">
            {t('recorder.deleteModal.delete')}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default DeleteModal
