import React, { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import Tooltip from '@components/Tooltip'
import type { Step } from '@shared/types/step'
import { describeStep } from '@shared/describeStep'
import { isSecretStep, isValidSecretName, secretNameOf } from '@shared/secretSteps'

interface CommandBlockProps {
  step: Step
  index: number
  showCode: boolean
  onDragStart: (index: number) => void
  onDragEnter: (index: number) => void
  onDragEnd: () => void
  onDelete: (index: number) => void
  onEdit?: (index: number, step: Step) => void
  isBreakpoint?: boolean
  onSetBreakpoint?: (index: number) => void
  onClearBreakpoint?: () => void
  onRecordFromHere?: (index: number) => void
  /** View-only: no editing, dragging, deleting or breakpoints */
  readOnly?: boolean
  /** The step recorded last */
  latest?: boolean
}

/** Lets the user change the environment variable a secret step reads, e.g. per test. */
const SecretRename: React.FC<{ name: string; onRename: (name: string) => void }> = ({
  name,
  onRename
}) => {
  const { t } = useTranslation()
  const [value, setValue] = useState<string | null>(null)
  const [invalid, setInvalid] = useState(false)

  if (value === null) {
    return (
      <button
        type="button"
        className="ml-2 text-xs text-ruby hover:underline"
        aria-label={t('recorder.step.secretRename')}
        onClick={() => {
          setValue(name)
          setInvalid(false)
        }}
      >
        {t('recorder.step.secretRename')}
      </button>
    )
  }

  const save = (): void => {
    const next = value.trim()
    if (!isValidSecretName(next)) {
      setInvalid(true)
      return
    }
    if (next !== name) onRename(next)
    setValue(null)
  }

  return (
    <span className="block mt-1">
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save()
          if (e.key === 'Escape') setValue(null)
        }}
        aria-label={t('recorder.step.secretNameLabel')}
        aria-invalid={invalid}
        className="font-mono text-xs border border-neutral-bdr rounded px-1 py-0.5"
      />
      {invalid && (
        <span className="block text-xs text-red-600 mt-1">
          {t('recorder.step.secretNameInvalid')}
        </span>
      )}
    </span>
  )
}

const CommandBlock: React.FC<CommandBlockProps> = ({
  step,
  index,
  showCode,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onDelete,
  onEdit,
  isBreakpoint,
  onSetBreakpoint,
  onClearBreakpoint,
  onRecordFromHere,
  readOnly = false,
  latest = false
}) => {
  const { t } = useTranslation()
  // Ruby for the code view, rendered by the main process for the project's automation
  const [code, setCode] = useState<string | null>(null)
  const [renderFailed, setRenderFailed] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const editValueRef = useRef('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isCancellingRef = useRef(false)

  useEffect((): (() => void) | undefined => {
    if (!showCode) return undefined
    let isMounted = true
    setCode(null)
    setRenderFailed(false)
    window.api
      .renderStep(step)
      .then((ruby) => {
        if (isMounted) setCode(ruby)
      })
      .catch(() => {
        if (isMounted) setRenderFailed(true)
      })
    return (): void => {
      isMounted = false
    }
  }, [step, showCode])

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.selectionStart = textareaRef.current.value.length
    }
  }, [isEditing])

  const handleEditStart = (): void => {
    // Editing starts from the rendered Ruby, so wait until it has arrived
    if (!readOnly && showCode && onEdit && code !== null) {
      editValueRef.current = code
      setEditValue(code)
      setIsEditing(true)
    }
  }

  const handleEditChange = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    editValueRef.current = e.target.value
    setEditValue(e.target.value)
  }

  const handleEditSave = (): void => {
    if (isCancellingRef.current) {
      isCancellingRef.current = false
      return
    }
    const trimmed = editValueRef.current.trim()
    // Hand-edited Ruby can't be mapped back to a structured step, so it becomes custom code
    if (trimmed && trimmed !== code && onEdit) {
      onEdit(index, { id: step.id, kind: 'custom', code: trimmed })
    }
    setIsEditing(false)
  }

  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleEditSave()
    }
    if (e.key === 'Escape') {
      isCancellingRef.current = true
      setIsEditing(false)
    }
  }

  const renderContent = (): JSX.Element => {
    if (showCode) {
      if (isEditing) {
        return (
          <textarea
            ref={textareaRef}
            value={editValue}
            onChange={handleEditChange}
            onBlur={handleEditSave}
            onKeyDown={handleEditKeyDown}
            className="font-mono text-sm text-ruby w-full bg-ruby-sub border border-ruby rounded p-1 resize-none focus:outline-none focus:ring-1 focus:ring-ruby"
            rows={Math.max(1, editValue.split('\n').length)}
            aria-label="Edit command"
          />
        )
      }

      return (
        <div
          className="font-mono text-sm cursor-text whitespace-pre-wrap text-ruby"
          onDoubleClick={handleEditStart}
          title={onEdit && !readOnly ? 'Double-click to edit' : undefined}
        >
          {renderFailed ? (
            <span className="text-neutral-mid font-sans">{t('recorder.step.renderFailed')}</span>
          ) : (
            (code ?? '\u00a0')
          )}
        </div>
      )
    }

    // Friendly view
    const { key, values } = describeStep(step)
    return (
      <span className="text-neutral-dark">
        {t(key, values)}
        {isSecretStep(step) && !readOnly && onEdit && (
          <SecretRename
            name={secretNameOf(step)}
            onRename={(secretName) => onEdit(index, { ...step, secretName })}
          />
        )}
      </span>
    )
  }

  const handleGutterClick = (): void => {
    if (isBreakpoint) {
      onClearBreakpoint?.()
    } else {
      onSetBreakpoint?.(index)
    }
  }

  return (
    <div
      className={`relative w-full mb-3 group/block ${latest ? 'rounded-lg ring-2 ring-ruby/40' : ''}`}
      data-latest={latest ? 'true' : undefined}
    >
      {/* Breakpoint gutter */}
      {!readOnly && (
        <div
          className="absolute left-0 top-0 bottom-0 w-5 flex items-center justify-center cursor-pointer z-20"
          onClick={handleGutterClick}
          title={
            isBreakpoint
              ? t('tooltips.recorder.clearBreakpoint')
              : t('tooltips.recorder.setBreakpoint')
          }
        >
          <div
            className={`w-2.5 h-2.5 rounded-full transition-colors ${
              isBreakpoint ? 'bg-amber-400' : 'bg-transparent group-hover/block:bg-amber-200'
            }`}
          />
        </div>
      )}

      <div
        className={`relative bg-white p-3 pl-4 pr-8 rounded-lg border transition-shadow duration-200 z-10 ml-5 ${
          readOnly ? '' : 'cursor-grab active:cursor-grabbing'
        } ${isBreakpoint ? 'border-amber-300 bg-amber-50/30' : 'border-neutral-bdr/50'}`}
        draggable={!isEditing && !readOnly}
        onDragStart={() => onDragStart(index)}
        onDragEnter={() => onDragEnter(index)}
        onDragEnd={onDragEnd}
        onDragOver={(e) => e.preventDefault()}
      >
        {renderContent()}

        {!readOnly && (
          <div className="absolute top-2 right-2">
            <Tooltip content={t('tooltips.recorder.deleteStep')} position="top">
              <button
                onClick={() => onDelete(index)}
                className="w-6 h-6 flex items-center justify-center rounded-full text-neutral-mid hover:bg-status-err-bg hover:text-red-600 transition-colors"
                aria-label="Delete step"
              >
                <span className="text-2xl font-light select-none leading-none">×</span>
              </button>
            </Tooltip>
          </div>
        )}
      </div>

      {!readOnly && isBreakpoint && onRecordFromHere && (
        <button
          onClick={() => onRecordFromHere(index)}
          className="mt-1 ml-5 text-xs text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded px-2 py-0.5 transition-colors font-medium"
        >
          ▶ {t('recorder.breakpoint.recordFromHere')}
        </button>
      )}
    </div>
  )
}

export default CommandBlock
