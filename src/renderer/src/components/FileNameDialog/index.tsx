import React, { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { entryNameProblem } from '@foundation/projectFilePaths'

interface FileNameDialogProps {
  title: string
  confirmLabel: string
  /** The name to start from (Rename); empty for a new entry */
  initialValue?: string
  /** Names already in the target folder */
  taken: string[]
  /** Does the work; resolves to an error to show, or null when done */
  onSubmit: (name: string) => Promise<string | null>
  onCancel: () => void
}

/**
 * Asks for a file or folder name (New file, New folder, Rename). A name that is empty,
 * `.`/`..`, has a separator or is already taken is refused in place: the dialog stays open
 * with the reason under the field.
 */
const FileNameDialog: React.FC<FileNameDialogProps> = ({
  title,
  confirmLabel,
  initialValue = '',
  taken,
  onSubmit,
  onCancel
}) => {
  const { t } = useTranslation()
  const [value, setValue] = useState(initialValue)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const titleId = useId()
  const errorId = useId()

  const submit = async (): Promise<void> => {
    if (busy) return
    const name = value.trim()
    // Keeping the current name is always fine (Rename does nothing then)
    const problem =
      initialValue !== '' && name === initialValue ? null : entryNameProblem(name, taken)
    if (problem) {
      setError(t(problem, { name }))
      return
    }
    setBusy(true)
    try {
      const failure = await onSubmit(name)
      if (failure) setError(failure)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-white rounded-lg shadow-lg p-6 w-96"
      >
        <h3 id={titleId} className="text-sm font-semibold text-neutral-dark mb-3">
          {title}
        </h3>
        <input
          type="text"
          aria-labelledby={titleId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setError(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit()
            if (e.key === 'Escape') onCancel()
          }}
          autoFocus
          className="w-full px-3 py-2 border border-neutral-bdr rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent"
        />
        {error && (
          <p id={errorId} role="alert" className="mt-2 text-xs text-red-600">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-sm text-neutral-dk hover:text-neutral-dark"
          >
            {t('files.name.cancel')}
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            className="px-3 py-1.5 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 disabled:opacity-50"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default FileNameDialog
