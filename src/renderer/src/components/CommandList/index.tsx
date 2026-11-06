import React, { useRef } from 'react'
import CommandBlock from '@components/CommandBlock'
import { useTranslation } from 'react-i18next'
import type { Step } from '@shared/types/step'
import useRecorderStore from '@foundation/Stores/recorderStore'

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
  /** Marks the last step as the latest one (while recording) */
  markLatest?: boolean
  /** The step the last run failed at */
  failedIndex?: number | null
  /** Anything shown under a step, such as a fix for the failed one */
  belowStep?: (index: number) => React.ReactNode
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
  readOnly = false,
  markLatest = false,
  failedIndex = null,
  belowStep
}) => {
  const { t } = useTranslation()
  const setGuideOpen = useRecorderStore((state) => state.setGuideOpen)
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
            <React.Fragment key={step.id}>
              <CommandBlock
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
                latest={markLatest && index === steps.length - 1}
                failed={failedIndex === index}
              />
              {belowStep?.(index)}
            </React.Fragment>
          ))
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-neutral-md">{t('recorder.placeholder.commands')}</p>
          </div>
        )}
      </div>
      {markLatest && (
        <div className="px-1 pt-2">
          <button
            type="button"
            onClick={() => setGuideOpen(true)}
            className="text-xs text-neutral-md underline hover:text-neutral-dark"
          >
            {t('testPage.showGuide')}
          </button>
        </div>
      )}
    </div>
  )
}

export default CommandList
