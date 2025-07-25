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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-lg w-1/3">
        <h2 className="text-lg font-semibold mb-4">{t('recorder.deleteModal.title')}</h2>
        <p className="mb-4">
          {t('recorder.deleteModal.message')}{' '}
          <span className="font-bold">{testName}</span>?
        </p>
        <div className="flex justify-end space-x-2">
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
