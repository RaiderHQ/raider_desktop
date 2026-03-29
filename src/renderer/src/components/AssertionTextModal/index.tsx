import React, { useState } from 'react'
import Button from '@components/Button'
import InputField from '@components/InputField'
import { useTranslation } from 'react-i18next'

interface AssertionTextModalProps {
  initialText: string
  assertionType?: string
  onSave: (text: string) => void
  onClose: () => void
}

const AssertionTextModal: React.FC<AssertionTextModalProps> = ({
  initialText,
  assertionType,
  onSave,
  onClose
}) => {
  const { t } = useTranslation()
  const [text, setText] = useState(initialText)

  const titleKey = `recorder.assertionTextModal.titles.${assertionType || 'text'}`
  const messageKey = `recorder.assertionTextModal.messages.${assertionType || 'text'}`
  const labelKey = `recorder.assertionTextModal.labels.${assertionType || 'text'}`

  const handleSave = (): void => {
    onSave(text)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      handleSave()
    }
  }

  const handleOutsideClick = (e: React.MouseEvent): void => {
    if ((e.target as HTMLElement).id === 'assertion-modal-overlay') {
      onClose()
    }
  }

  return (
    <div
      id="assertion-modal-overlay"
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={handleOutsideClick}
    >
      <div
        className="bg-white rounded-xl shadow-elevated w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-bdr">
          <h2 className="text-lg font-semibold text-neutral-dark">{t(titleKey)}</h2>
        </div>

        {/* Body */}
        <div className="px-6 py-4">
          <p className="mb-4 text-sm text-neutral-dk">{t(messageKey)}</p>
          <InputField
            label={t(labelKey)}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />
        </div>

        {/* Footer */}
        <div className="border-t border-neutral-bdr px-6 py-4 flex justify-end space-x-2">
          <Button type="secondary" onClick={onClose}>
            {t('recorder.assertionTextModal.cancel')}
          </Button>
          <Button type="primary" onClick={handleSave}>
            {t('recorder.assertionTextModal.save')}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default AssertionTextModal
