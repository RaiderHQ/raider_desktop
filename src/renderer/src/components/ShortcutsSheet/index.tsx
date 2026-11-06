import React, { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { SHORTCUTS, shortcutLabel, platformFrom } from '@shared/shortcuts'
import type { ShortcutId } from '@shared/shortcuts'

interface ShortcutsSheetProps {
  onClose: () => void
}

// The menu bar's order; how-it-works and docs have no key
const ROWS: (ShortcutId | 'how-it-works' | 'docs')[] = [
  'save',
  'run',
  'record',
  'stop',
  'new-test',
  'new-project',
  'open-project',
  'open-file',
  'how-it-works',
  'docs',
  'shortcuts'
]

/** Help › Keyboard shortcuts: every key in the menu bar, from the shared table. */
const ShortcutsSheet: React.FC<ShortcutsSheetProps> = ({ onClose }) => {
  const { t } = useTranslation()
  const platform = platformFrom(navigator.platform)
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const buttons = (): HTMLButtonElement[] =>
    Array.from(
      dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? []
    )

  // Take focus from the page behind and give it back on close
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    return (): void => previous?.focus?.()
  }, [])

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
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
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        onKeyDown={onKeyDown}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-xl shadow-elevated w-full max-w-md max-h-[85vh] flex flex-col"
      >
        <div className="px-6 py-4 border-b border-neutral-bdr shrink-0">
          <h2 id="shortcuts-title" className="text-lg font-semibold text-neutral-dark">
            {t('shortcuts.title')}
          </h2>
        </div>
        <div className="px-6 py-4 overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-neutral-md">
                <th className="py-1 font-semibold">{t('shortcuts.action')}</th>
                <th className="py-1 font-semibold">{t('shortcuts.key')}</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((id) => (
                <tr key={id} className="border-t border-neutral-bdr">
                  <td className="py-2 text-neutral-dk">{t(`shortcuts.actions.${id}`)}</td>
                  <td className="py-2 text-neutral-dark">
                    {id in SHORTCUTS ? (
                      <kbd className="px-1.5 py-0.5 rounded bg-neutral-100 font-sans text-xs">
                        {shortcutLabel(id as ShortcutId, platform)}
                      </kbd>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* DocsLink docs.recorder: PR D */}
        </div>
        <div className="border-t border-neutral-bdr px-6 py-4 flex justify-end shrink-0">
          <CloseButton innerRef={closeRef} onClick={onClose} label={t('shortcuts.close')} />
        </div>
      </div>
    </div>
  )
}

// Button has no ref; a plain button keeps the initial focus simple
const CloseButton: React.FC<{
  innerRef: React.RefObject<HTMLButtonElement>
  onClick: () => void
  label: string
}> = ({ innerRef, onClick, label }) => (
  <button
    ref={innerRef}
    onClick={onClick}
    className="px-5 py-2.5 text-sm font-semibold rounded-md bg-ruby-sub text-neutral-dk border border-neutral-bdr hover:bg-ruby-glow"
  >
    {label}
  </button>
)

export default ShortcutsSheet
