import React from 'react'
import toast from 'react-hot-toast'
import i18n from 'i18next'

const UNDO_WINDOW_MS = 6000

const UndoToast: React.FC<{ message: string; onUndo: () => void }> = ({ message, onUndo }) => (
  <span className="flex items-center gap-3 text-sm text-neutral-dark">
    {message}
    <button
      type="button"
      onClick={onUndo}
      className="font-semibold text-ruby underline underline-offset-2"
    >
      {i18n.t('files.toast.undo')}
    </button>
  </span>
)

/** A success toast with Undo for a few seconds; Undo runs once and closes the toast. */
export function successWithUndo(message: string, undo: () => void): void {
  let done = false
  toast.success(
    (instance) => (
      <UndoToast
        message={message}
        onUndo={() => {
          if (done) return
          done = true
          toast.dismiss(instance.id)
          undo()
        }}
      />
    ),
    { duration: UNDO_WINDOW_MS }
  )
}
