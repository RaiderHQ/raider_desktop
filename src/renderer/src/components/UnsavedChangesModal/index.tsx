import React, { useEffect, useRef } from 'react'
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
  const dialogRef = useRef<HTMLDivElement>(null)
  const buttons = (): HTMLButtonElement[] =>
    Array.from(
      dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? []
    )

  // Take focus from the editor (typing must not keep editing the file behind the dialog)
  // and give it back when the dialog closes
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    // Save is the last button, and the safe default
    buttons().at(-1)?.focus()
    return (): void => previous?.focus?.()
  }, [])

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
      return
    }
    if (e.key !== 'Tab') return
    const all = buttons()
    if (all.length === 0) return
    const first = all[0]
    const last = all[all.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={onKeyDown}
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
