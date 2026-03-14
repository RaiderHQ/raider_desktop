import React, { useRef } from 'react'
import CommandBlock from '@components/CommandBlock'
import { useTranslation } from 'react-i18next'

interface CommandListProps {
  steps: string[]
  setSteps: React.Dispatch<React.SetStateAction<string[]>>
  onDeleteStep: (index: number) => void
  onEditStep?: (index: number, newCommand: string) => void
  showCode: boolean
}

const CommandList: React.FC<CommandListProps> = ({
  steps,
  setSteps,
  onDeleteStep,
  onEditStep,
  showCode
}) => {
  const { t } = useTranslation()
  const dragItemIndex = useRef<number | null>(null)

  const handleDragStart = (index: number): void => {
    dragItemIndex.current = index
  }

  const handleDragEnter = (index: number): void => {
    if (dragItemIndex.current === null || dragItemIndex.current === index) return

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
      <div className="w-full flex-grow h-full max-h-[60vh] overflow-y-auto p-1 bg-neutral-lt rounded-b-md">
        {steps.length > 0 ? (
          steps.map((step, index) => (
            <CommandBlock
              key={index}
              command={step}
              index={index}
              showCode={showCode}
              onDragStart={handleDragStart}
              onDragEnter={handleDragEnter}
              onDragEnd={handleDragEnd}
              onDelete={onDeleteStep}
              onEdit={onEditStep}
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
