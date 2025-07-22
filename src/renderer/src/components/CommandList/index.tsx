import React, { useRef, useState } from 'react'
import CommandBlock from '@components/CommandBlock'
import { useTranslation } from 'react-i18next'
import Button from '@components/Button'

interface CommandListProps {
  steps: string[]
  setSteps: React.Dispatch<React.SetStateAction<string[]>>
  onDeleteStep: (index: number) => void
}

const CommandList: React.FC<CommandListProps> = ({ steps, setSteps, onDeleteStep }) => {
  const { t } = useTranslation()
  const dragItemIndex = useRef<number | null>(null)
  const [showCode, setShowCode] = useState(false)

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
      <div className="flex-none p-1 border-b border-gray-200">
        <Button onClick={() => setShowCode(!showCode)} type="secondary">
          {showCode ? 'Show Friendly View' : 'Show Code View'}
        </Button>
      </div>
      <div className="w-full flex-grow h-full max-h-[60vh] overflow-y-auto p-1 bg-gray-50 rounded-b-md">
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
            />
          ))
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-400">{t('recorder.placeholder.commands')}</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default CommandList
