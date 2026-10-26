import React, { useRef } from 'react'
import CommandBlock from '@components/CommandBlock'
import { useTranslation } from 'react-i18next'
import type { Step } from '@shared/types/step'

interface CommandListProps {
  steps: Step[]
  setSteps: React.Dispatch<React.SetStateAction<Step[]>>
  onDeleteStep: (index: number) => void
  onEditStep?: (index: number, step: Step) => void
  showCode: boolean
  breakpointIndex?: number | null
  onSetBreakpoint?: (index: number) => void
  onClearBreakpoint?: () => void
  onRecordFromHere?: (index: number) => void
  readOnly?: boolean
}

const CommandList: React.FC<CommandListProps> = ({
  steps,
  setSteps,
  onDeleteStep,
  onEditStep,
  showCode,
  breakpointIndex,
  onSetBreakpoint,
  onClearBreakpoint,
  onRecordFromHere,
  readOnly = false
}) => {
  const { t } = useTranslation()
  const dragItemIndex = useRef<number | null>(null)

  const handleDragStart = (index: number): void => {
    if (readOnly) return
    dragItemIndex.current = index
  }

  const handleDragEnter = (index: number): void => {
    if (readOnly || dragItemIndex.current === null || dragItemIndex.current === index) return

    const newSteps = [...steps]
    const [draggedItem] = newSteps.splice(dragItemIndex.current, 1)
    newSteps.splice(index, 0, draggedItem)
    dragItemIndex.current = index
    setSteps(newSteps)
  }

  const handleDragEnd = (): void => {
    dragItemIndex.current = null
  }

  return (
    <div className="flex flex-col h-full">
      <div className="w-full flex-grow h-full max-h-[60vh] overflow-y-auto p-1">
        {steps.length > 0 ? (
          steps.map((step, index) => (
            <CommandBlock
              key={step.id}
              step={step}
              index={index}
              showCode={showCode}
              onDragStart={handleDragStart}
              onDragEnter={handleDragEnter}
              onDragEnd={handleDragEnd}
              onDelete={onDeleteStep}
              onEdit={onEditStep}
              isBreakpoint={breakpointIndex === index}
              onSetBreakpoint={onSetBreakpoint}
              onClearBreakpoint={onClearBreakpoint}
              onRecordFromHere={onRecordFromHere}
              readOnly={readOnly}
            />
          ))
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-neutral-mid">{t('recorder.placeholder.commands')}</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default CommandList
