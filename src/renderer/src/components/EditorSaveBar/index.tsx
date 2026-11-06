import React from 'react'
import { useTranslation } from 'react-i18next'
import Tooltip from '@components/Tooltip'
import { platformFrom, shortcutLabel } from '@shared/shortcuts'

interface EditorSaveBarProps {
  fileName: string
  dirty: boolean
  saving: boolean
  onSave: () => void
  /** Rendered before the file name (a back button, for instance) */
  children?: React.ReactNode
}

/** The file's name, whether it has unsaved changes, and a Save button (Cmd+S stays). */
const EditorSaveBar: React.FC<EditorSaveBarProps> = ({
  fileName,
  dirty,
  saving,
  onSave,
  children
}) => {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-neutral-bdr shrink-0 min-w-0">
      {children}
      <span className="text-sm font-semibold text-neutral-dark truncate">{fileName}</span>
      <span
        className={`text-xs flex items-center gap-1 ${dirty ? 'text-neutral-dark' : 'text-neutral-dk'}`}
        aria-live="polite"
      >
        {dirty && (
          <span aria-hidden="true" className="text-ruby text-base leading-none">
            •
          </span>
        )}
        {dirty ? t('editor.status.unsaved') : t('editor.status.saved')}
      </span>
      <Tooltip
        content={t('tooltips.editor.save')}
        disabledReason={dirty ? undefined : t('editor.status.saved')}
        shortcut="save"
        position="bottom"
        className="ml-auto"
      >
        <button
          type="button"
          onClick={onSave}
          disabled={!dirty || saving}
          className="text-xs px-3 py-1 rounded border font-semibold transition-colors bg-ruby text-white border-ruby hover:shadow-card-hover disabled:bg-white disabled:text-neutral-mid disabled:border-neutral-bdr disabled:cursor-not-allowed"
        >
          {t('editor.saveButton')}
          <kbd aria-hidden="true" className="ml-1.5 text-[10px] opacity-80">
            {shortcutLabel('save', platformFrom(navigator.platform))}
          </kbd>
        </button>
      </Tooltip>
    </div>
  )
}

export default EditorSaveBar
