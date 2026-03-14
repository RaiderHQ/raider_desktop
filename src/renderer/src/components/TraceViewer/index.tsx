import React from 'react'
import { useTranslation } from 'react-i18next'
import TraceTimeline from '@components/TraceTimeline'
import TraceDetailPanel from '@components/TraceDetailPanel'
import Button from '@components/Button'
import type { TraceStep } from '@foundation/Types/traceStep'

interface TraceViewerProps {
  traceSteps: TraceStep[]
  selectedTraceStepId: string | null
  onSelectStep: (id: string | null) => void
  onBack: () => void
}

/**
 * Reusable trace viewer component used by both ProjectDashboard
 * and RecordingDashboard. Displays a timeline + detail panel layout.
 */
const TraceViewer: React.FC<TraceViewerProps> = ({
  traceSteps,
  selectedTraceStepId,
  onSelectStep,
  onBack
}) => {
  const { t } = useTranslation()

  return (
    <div className="p-2 min-h-fit sm:p-4 md:p-6 w-full flex flex-col">
      <div className="mb-4 flex items-center gap-4">
        <Button onClick={onBack} type="secondary">
          {t('dashboard.backToResults')}
        </Button>
        <h2 className="text-xl font-bold">{t('dashboard.traceTitle')}</h2>
      </div>
      <div className="flex flex-1 min-h-0 border border-neutral-bdr rounded-lg shadow-card bg-white">
        <div className="w-[30%] border-r border-neutral-bdr overflow-y-auto">
          <TraceTimeline
            steps={traceSteps}
            selectedStepId={selectedTraceStepId}
            onSelectStep={onSelectStep}
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
