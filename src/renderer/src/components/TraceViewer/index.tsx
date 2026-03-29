import React from 'react'
import { useTranslation } from 'react-i18next'
import TraceTimeline from '@components/TraceTimeline'
import TraceDetailPanel from '@components/TraceDetailPanel'
import type { TraceStep } from '@foundation/Types/traceStep'

interface TraceViewerProps {
  traceSteps: TraceStep[]
  selectedTraceStepId: string | null
  onSelectStep: (id: string | null) => void
}

/**
 * Reusable trace viewer component. Displays a timeline + detail panel layout.
 */
const TraceViewer: React.FC<TraceViewerProps> = ({
  traceSteps,
  selectedTraceStepId,
  onSelectStep
}) => {
  const { t } = useTranslation()

  return (
    <div className="p-2 min-h-fit sm:p-4 md:p-6 w-full flex flex-col">
      <p className="text-xs font-semibold text-neutral-mid uppercase tracking-wide mb-3">
        {t('dashboard.traceTitle')}
      </p>
      <div className="flex flex-1 min-h-0 border border-neutral-bdr rounded-lg shadow-card bg-white">
        <div className="w-[30%] border-r border-neutral-bdr overflow-y-auto">
          <TraceTimeline
            steps={traceSteps}
            selectedStepId={selectedTraceStepId}
            onSelectStep={(id) => onSelectStep(id)}
          />
        </div>
        <div className="w-[70%] overflow-y-auto">
          <TraceDetailPanel
            step={traceSteps.find((s) => s.id === selectedTraceStepId) || null}
          />
        </div>
      </div>
    </div>
  )
}

export default TraceViewer
