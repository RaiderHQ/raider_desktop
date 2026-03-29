import React, { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { ParsedCommand } from '@foundation/Types/command'
import Tooltip from '@components/Tooltip'

interface CommandBlockProps {
  command: string
  index: number
  showCode: boolean
  onDragStart: (index: number) => void
  onDragEnter: (index: number) => void
  onDragEnd: () => void
  onDelete: (index: number) => void
  onEdit?: (index: number, newCommand: string) => void
  isBreakpoint?: boolean
  onSetBreakpoint?: (index: number) => void
  onClearBreakpoint?: () => void
  onRecordFromHere?: (index: number) => void
}

const CommandBlock: React.FC<CommandBlockProps> = ({
  command,
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
  onRecordFromHere
}) => {
  const { t } = useTranslation()
  const [mainCommand, comment] = command.split(' # ')
  const [parsedCommand, setParsedCommand] = useState<string | ParsedCommand>('Loading...')
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(command)
  const editValueRef = useRef(command)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isCancellingRef = useRef(false)

  useEffect((): (() => void) => {
    let isMounted = true

    if (!showCode) {
      setParsedCommand('Loading...')
      const parser = mainCommand.includes(':xpath,')
        ? window.api.xpathParser
        : window.api.commandParser
      parser(mainCommand).then((result: string | ParsedCommand) => {
        if (isMounted) {
          setParsedCommand(result)
        }
      })
    }

    return (): void => {
      isMounted = false
    }
  }, [mainCommand, showCode])

  useEffect(() => {
    editValueRef.current = command
    setEditValue(command)
  }, [command])

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.selectionStart = textareaRef.current.value.length
    }
  }, [isEditing])

  const handleEditStart = (): void => {
    if (showCode && onEdit) {
      editValueRef.current = command
      setEditValue(command)
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
    if (trimmed && trimmed !== command && onEdit) {
      onEdit(index, trimmed)
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
      editValueRef.current = command
      setEditValue(command)
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
          className="font-mono text-sm cursor-text"
          onDoubleClick={handleEditStart}
          title={onEdit ? 'Double-click to edit' : undefined}
        >
          <span className="text-ruby">{mainCommand}</span>
          {comment && <span className="text-neutral-mid ml-2"># {comment}</span>}
        </div>
      )
    }

    // Friendly view
    if (typeof parsedCommand === 'string') {
      return <span className="text-neutral-dark">{parsedCommand}</span>
    }
    const { key, values } = parsedCommand
    return <span className="text-neutral-dark">{t(key, values)}</span>
  }

  const handleGutterClick = (): void => {
    if (isBreakpoint) {
      onClearBreakpoint?.()
    } else {
      onSetBreakpoint?.(index)
    }
  }

  return (
    <div className="relative w-full mb-3 group/block">
      {/* Breakpoint gutter */}
      <div
        className="absolute left-0 top-0 bottom-0 w-5 flex items-center justify-center cursor-pointer z-20"
        onClick={handleGutterClick}
        title={isBreakpoint ? t('tooltips.recorder.clearBreakpoint') : t('tooltips.recorder.setBreakpoint')}
      >
        <div className={`w-2.5 h-2.5 rounded-full transition-colors ${
          isBreakpoint
            ? 'bg-amber-400'
            : 'bg-transparent group-hover/block:bg-amber-200'
        }`} />
      </div>

      <div
        className={`relative bg-white p-3 pl-4 pr-8 rounded-lg border transition-shadow duration-200 z-10 cursor-grab active:cursor-grabbing ml-5 ${
          isBreakpoint ? 'border-amber-300 bg-amber-50/30' : 'border-neutral-bdr/50'
        }`}
        draggable={!isEditing}
        onDragStart={() => onDragStart(index)}
        onDragEnter={() => onDragEnter(index)}
        onDragEnd={onDragEnd}
        onDragOver={(e) => e.preventDefault()}
      >
        {renderContent()}

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
      </div>

      {isBreakpoint && onRecordFromHere && (
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
