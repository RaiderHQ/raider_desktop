import React, { useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

/** A reason short enough to read in the toast itself; anything longer goes behind an expander. */
const fitsInline = (details: string): boolean => !details.includes('\n') && details.length <= 200

interface ErrorToastProps {
  summary: string
  details?: string
  onDismiss: () => void
}

export const ErrorToast: React.FC<ErrorToastProps> = ({ summary, details, onDismiss }) => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const reason = details?.trim() || ''

  return (
    <div className="flex flex-col gap-1 max-w-md min-w-0">
      <div className="flex items-start gap-3">
        <span className="flex-1 text-sm text-neutral-dark">{summary}</span>
        <button
          type="button"
          aria-label={t('errorToast.dismiss')}
          onClick={onDismiss}
          className="text-neutral-dk hover:text-neutral-dark leading-none text-lg -mt-0.5"
        >
          ×
        </button>
      </div>
      {reason && fitsInline(reason) && (
        <p className="text-xs text-neutral-dk break-words">{reason}</p>
      )}
      {reason && !fitsInline(reason) && (
        <>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="self-start text-xs text-ruby underline"
          >
            {open ? t('errorToast.hideDetails') : t('errorToast.showDetails')}
          </button>
          {open && (
            <pre className="text-xs text-neutral-dk bg-neutral-lt rounded p-2 max-h-48 overflow-auto whitespace-pre-wrap break-words select-text">
              {reason}
            </pre>
          )}
        </>
      )}
    </div>
  )
}

/**
 * One readable line, the raw reason (a stack trace, a shell error) kept behind
 * "Show details", and a Dismiss control: the toast stays until the user closes it.
 */
export function showErrorToast(summary: string, details?: string): string {
  return toast.error(
    (instance) => (
      <ErrorToast
        summary={summary}
        details={details}
        onDismiss={() => toast.dismiss(instance.id)}
      />
    ),
    { duration: Infinity }
  )
}
