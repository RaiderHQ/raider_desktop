import React from 'react'
import { useTranslation } from 'react-i18next'
import Button from '@components/Button'

interface UnsavedChangesModalProps {
  fileName: string
  onSave: () => void
  onDiscard: () => void
  onCancel: () => void
}

/** "Save changes to x?" with Save, Don't save and Cancel, before an edit would be lost. */
const UnsavedChangesModal: React.FC<UnsavedChangesModalProps> = ({
  fileName,
  onSave,
  onDiscard,
  onCancel
}) => {
  const { t } = useTranslation()
  const title = t('editor.unsaved.title', { fileName })
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="bg-white rounded-xl shadow-elevated w-full max-w-md"
      >
        <div className="px-6 py-4 border-b border-neutral-bdr">
          <h2 className="text-lg font-semibold text-neutral-dark break-words">{title}</h2>
        </div>
        <div className="px-6 py-4">
          <p className="text-neutral-dk">{t('editor.unsaved.message')}</p>
        </div>
        <div className="border-t border-neutral-bdr px-6 py-4 flex justify-end space-x-2">
          <Button onClick={onCancel} type="secondary">
            {t('editor.unsaved.cancel')}
          </Button>
          <Button onClick={onDiscard} type="outline">
            {t('editor.unsaved.discard')}
          </Button>
          <Button onClick={onSave} type="primary">
            {t('editor.unsaved.save')}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default UnsavedChangesModal
