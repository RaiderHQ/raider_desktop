import React, { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import Tooltip from '@components/Tooltip'
import Icon from '@components/Icon'
import InputNameModal from '@components/InputNameModal'
import type { Step } from '@shared/types/step'
import { describeStep, foundBy } from '@shared/describeStep'
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
  /** The step the last run failed at */
  failed?: boolean
  /** A flow being edited: a typed step can become an input runs give a value for */
  canUseInputs?: boolean
}

type TypeStep = Extract<Step, { kind: 'type' }>

/** A flow's typing step: use it as an input, rename that input, or stop using it as one. */
const InputActions: React.FC<{
  step: TypeStep
  onName: () => void
  onChange: (step: TypeStep) => void
}> = ({ step, onName, onChange }) => {
  const { t } = useTranslation()
  const link = 'text-xs text-ruby hover:underline'
  const stop = (): void => {
    const rest = { ...step }
    delete rest.inputName
    onChange(rest)
  }

  return (
    <span className="flex items-center gap-3 mt-1">
      {step.inputName ? (
        <>
          <Tooltip content={t('tooltips.steps.changeInput')} position="bottom">
            <button type="button" className={link} onClick={onName}>
              {t('recorder.step.changeInput')}
            </button>
          </Tooltip>
          <Tooltip content={t('tooltips.steps.stopInput')} position="bottom">
            <button type="button" className={link} onClick={stop}>
              {t('recorder.step.stopInput')}
            </button>
          </Tooltip>
        </>
      ) : (
        <Tooltip content={t('tooltips.steps.useAsInput')} position="bottom">
          <button type="button" className={link} onClick={onName}>
            {t('recorder.step.useAsInput')}
          </button>
        </Tooltip>
      )}
    </span>
  )
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
  latest = false,
  failed = false,
  canUseInputs = false
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
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [namingInput, setNamingInput] = useState(false)
  // A secret is never an input: its value comes from RAIDER_SECRET_
  const inputStep =
    canUseInputs && !readOnly && onEdit && step.kind === 'type' && !isSecretStep(step) ? step : null

  // The failure usually arrives after the steps render, so this runs when it does
  useEffect(() => {
    if (failed) wrapperRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [failed])

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
            aria-label={t('recorder.step.editCommand')}
          />
        )
      }

      const codeLine = (
        <div
          className="font-mono text-sm cursor-text whitespace-pre-wrap text-ruby"
          onDoubleClick={handleEditStart}
        >
          {renderFailed ? (
            <span className="text-neutral-md font-sans">{t('recorder.step.renderFailed')}</span>
          ) : (
            (code ?? '\u00a0')
          )}
        </div>
      )

      return onEdit && !readOnly ? (
        <Tooltip content={t('tooltips.steps.edit')} position="bottom" className="w-full">
          {codeLine}
        </Tooltip>
      ) : (
        codeLine
      )
    }

    // Friendly view
    const { key, values } = describeStep(step)
    const found = 'element' in step ? foundBy(step.element) : null
    return (
      <span className="text-neutral-dark">
        {t(key, values)}
        {found && (
          <span className="flex items-center gap-1 text-xs text-neutral-md">
            <span data-testid="step-found-by">{t(found.key, found.values)}</span>
            {found.weak && (
              <Tooltip content={t('tooltips.steps.weakLocator')} position="top">
                <span
                  data-testid="step-weak-locator"
                  role="img"
                  title={t('recorder.foundBy.weak')}
                  aria-label={t('recorder.foundBy.weak')}
                  className="inline-flex"
                >
                  <Icon name="warning" size={12} color="currentColor" />
                </span>
              </Tooltip>
            )}
          </span>
        )}
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
      ref={wrapperRef}
      className="relative w-full mb-3 group/block"
      data-latest={latest ? 'true' : undefined}
      data-testid={failed ? 'step-failed' : undefined}
    >
      {/* Breakpoint gutter */}
      {!readOnly && (
        <div className="absolute left-0 top-0 bottom-0 w-5 z-20">
          <Tooltip
            content={
              isBreakpoint ? t('tooltips.recorder.clearBreakpoint') : t('tooltips.steps.breakpoint')
            }
            className="w-full h-full"
          >
            <div
              className="w-full h-full flex items-center justify-center cursor-pointer"
              onClick={handleGutterClick}
            >
              <div
                className={`w-2.5 h-2.5 rounded-full transition-colors ${
                  isBreakpoint ? 'bg-amber-400' : 'bg-transparent group-hover/block:bg-amber-200'
                }`}
              />
            </div>
          </Tooltip>
        </div>
      )}

      <div
        data-testid="step-card"
        className={`relative bg-white p-3 pl-4 pr-8 rounded-lg border transition-shadow duration-200 z-10 ml-5 ${
          readOnly ? '' : 'cursor-grab active:cursor-grabbing'
        } ${isBreakpoint ? 'border-amber-300 bg-amber-50/30' : 'border-neutral-bdr/50'} ${
          // The failed highlight wins over the latest one; the ring hugs the card itself
          failed ? 'ring-2 ring-inset ring-red-400' : latest ? 'ring-2 ring-inset ring-ruby/40' : ''
        }`}
        draggable={!isEditing && !readOnly}
        onDragStart={() => onDragStart(index)}
        onDragEnter={() => onDragEnter(index)}
        onDragEnd={onDragEnd}
        onDragOver={(e) => e.preventDefault()}
      >
        {!readOnly && (
          <div className="absolute left-0.5 top-1/2 -translate-y-1/2">
            <Tooltip content={t('tooltips.steps.drag')} position="right">
              <span aria-hidden="true" className="text-xs leading-none text-neutral-md select-none">
                ⋮⋮
              </span>
            </Tooltip>
          </div>
        )}

        {renderContent()}

        {inputStep && (
          <InputActions
            step={inputStep}
            onName={() => setNamingInput(true)}
            onChange={(next) => onEdit?.(index, next)}
          />
        )}

        {!readOnly && (
          <div className="absolute top-2 right-2">
            <Tooltip content={t('tooltips.recorder.deleteStep')} position="top">
              <button
                onClick={() => onDelete(index)}
                className="w-6 h-6 flex items-center justify-center rounded-full text-neutral-md hover:bg-status-err-bg hover:text-red-600 transition-colors"
                aria-label={t('recorder.step.delete')}
              >
                <span className="text-2xl font-light select-none leading-none">×</span>
              </button>
            </Tooltip>
          </div>
        )}
      </div>

      {/* Outside the draggable card: React events bubble through the portal to its owner */}
      {inputStep && namingInput && (
        <InputNameModal
          initialName={inputStep.inputName ?? ''}
          defaultValue={inputStep.text}
          onSave={(inputName) => {
            setNamingInput(false)
            onEdit?.(index, { ...inputStep, inputName })
          }}
          onClose={() => setNamingInput(false)}
        />
      )}

      {!readOnly && isBreakpoint && onRecordFromHere && (
        <Tooltip content={t('tooltips.steps.recordFromHere')} position="bottom" className="ml-5">
          <button
            onClick={() => onRecordFromHere(index)}
            className="mt-1 text-xs text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded px-2 py-0.5 transition-colors font-medium"
          >
            ▶ {t('recorder.breakpoint.recordFromHere')}
          </button>
        </Tooltip>
      )}
    </div>
  )
}

export default CommandBlock
