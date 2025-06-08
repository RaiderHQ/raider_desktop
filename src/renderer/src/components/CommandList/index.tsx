import React, { useRef } from 'react'
import CommandBlock from '@components/CommandBlock'
import { useTranslation } from 'react-i18next'

interface CommandListProps {
  steps: string[]
  setSteps: React.Dispatch<React.SetStateAction<string[]>>
  // Add the delete handler prop
  onDeleteStep: (index: number) => void
}

const CommandList: React.FC<CommandListProps> = ({ steps, setSteps, onDeleteStep }) => {
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
    <div className="w-full h-full overflow-y-auto p-1 bg-gray-200 rounded-b-md">
      {steps.length > 0 ? (
        steps.map((step, index) => (
          <CommandBlock
            key={index}
            command={step}
            index={index}
            onDragStart={handleDragStart}
            onDragEnter={handleDragEnter}
            onDragEnd={handleDragEnd}
            // Pass the delete handler to each block
            onDelete={onDeleteStep}
          />
        ))
      ) : (
        <div className="flex items-center justify-center h-full">
          <p className="text-gray-400">{t('recorder.placeholder.commands')}</p>
        </div>
      )}
    </div>
  )
}

export default CommandList
