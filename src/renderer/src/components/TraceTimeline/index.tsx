import React, { useEffect, useRef, useState } from 'react'
import type { TraceStep } from '@foundation/Types/traceStep'
import { useTranslation } from 'react-i18next'

interface TraceTimelineProps {
  steps: TraceStep[]
  selectedStepId: string | null
  onSelectStep: (stepId: string) => void
}

const TraceTimeline: React.FC<TraceTimelineProps> = ({
  steps,
  selectedStepId,
  onSelectStep
}): JSX.Element => {
  const { t } = useTranslation()
  const bottomRef = useRef<HTMLDivElement>(null)
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({})

  // Auto-scroll to latest step
  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: 'smooth' })
  }, [steps.length])

  // Load thumbnails on demand
  useEffect(() => {
    for (const step of steps) {
      if (step.screenshotPath && !thumbnails[step.id]) {
        window.api.readImage(step.screenshotPath).then((result) => {
          if (result.success && result.data) {
            setThumbnails((prev) => ({
              ...prev,
              [step.id]: `data:image/${result.fileExt || 'jpeg'};base64,${result.data}`
            }))
          }
        })
      }
    }
  }, [steps])

  if (steps.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-mid text-sm p-4">
        {t('recorder.traceTimeline.noTrace')}
      </div>
    )
  }

  const startTime = steps[0]?.timestamp || 0

  return (
    <div className="flex flex-col h-full overflow-y-auto p-2 space-y-2">
      <h4 className="text-sm font-semibold text-neutral-dk px-1">
        {t('recorder.traceTimeline.title')}
      </h4>
      {steps.map((step, index) => {
        const isSelected = step.id === selectedStepId
        const timeDelta = step.timestamp - startTime
        const seconds = (timeDelta / 1000).toFixed(1)

        return (
          <button
            key={step.id}
            onClick={() => onSelectStep(step.id)}
            className={`flex flex-col p-2 rounded-lg border text-left transition-colors ${
              isSelected
                ? 'border-ruby bg-ruby-sub'
                : 'border-neutral-bdr bg-white hover:bg-neutral-lt'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold text-neutral-mid w-5 text-center">{index + 1}</span>
              <span className="text-xs text-neutral-mid">+{seconds}s</span>
            </div>
            {thumbnails[step.id] ? (
              <img
                src={thumbnails[step.id]}
                alt={`Step ${index + 1}`}
                className="w-full h-20 object-cover rounded border border-neutral-lt"
              />
            ) : (
              <div className="w-full h-20 bg-neutral-lt rounded flex items-center justify-center text-xs text-neutral-mid">
                ...
              </div>
            )}
          </button>
        )
      })}
      <div ref={bottomRef} />
    </div>
  )
}

export default TraceTimeline
