import React, { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { ParsedCommand } from '@foundation/Types/command'

interface CommandBlockProps {
  command: string
  index: number
  showCode: boolean
  onDragStart: (index: number) => void
  onDragEnter: (index: number) => void
  onDragEnd: () => void
  onDelete: (index: number) => void
  onEdit?: (index: number, newCommand: string) => void
}

const CommandBlock: React.FC<CommandBlockProps> = ({
  command,
  index,
  showCode,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onDelete,
  onEdit
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

  return (
    <div className="relative w-full mb-3">
      <div
        className="relative bg-white p-3 pl-4 pr-8 rounded-lg border border-neutral-bdr/50 cursor-grab active:cursor-grabbing transition-shadow duration-200 z-10"
        draggable={!isEditing}
        onDragStart={() => onDragStart(index)}
        onDragEnter={() => onDragEnter(index)}
        onDragEnd={onDragEnd}
        onDragOver={(e) => e.preventDefault()}
      >
        {renderContent()}

        <button
          onClick={() => onDelete(index)}
          className="absolute top-1/2 -translate-y-1/2 right-2 w-6 h-6 flex items-center justify-center rounded-full text-neutral-mid hover:bg-status-err-bg hover:text-red-600 transition-colors"
          aria-label="Delete step"
        >
          <span className="text-2xl font-light select-none leading-none">×</span>
        </button>
      </div>
    </div>
  )
}

export default CommandBlock
