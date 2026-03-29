import React from 'react'
import { useTranslation } from 'react-i18next'
import PieChartWidget from '@components/PieChartWidget'
import TestResultCard from '@components/TestResultCard'
import TraceViewer from '@components/TraceViewer'
import { useTraceViewer } from '../../hooks/useTraceViewer'

interface RSpecExample {
  id: string
  description: string
  full_description: string
  status: 'passed' | 'failed' | 'pending'
  file_path: string
  line_number: number
  run_time: number
  pending_message: string | null
  exception?: { class: string; message: string; backtrace: string[] }
}

interface RSpecSummary {
  duration: number
  example_count: number
  failure_count: number
  pending_count: number
  errors_outside_of_examples_count: number
}

interface RSpecOutput {
  version: string
  examples: RSpecExample[]
  summary: RSpecSummary
  summary_line: string
}

interface RecordingDashboardProps {
  runOutput: string
}

const EmptyState: React.FC = () => {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center justify-center py-14 px-6">
      <div className="w-12 h-12 rounded-full bg-neutral-100 border border-neutral-bdr flex items-center justify-center mb-4">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-mid">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      </div>
      <h3 className="text-sm font-semibold text-neutral-dark mb-1">{t('dashboard.noRecordingResults.title')}</h3>
      <p className="text-xs text-neutral-mid text-center mb-6 max-w-xs">{t('dashboard.noRecordingResults.subtitle')}</p>
      <div className="space-y-3 w-full max-w-sm">
        {([
          t('dashboard.noRecordingResults.step1'),
          t('dashboard.noRecordingResults.step2'),
          t('dashboard.noRecordingResults.step3'),
          t('dashboard.noRecordingResults.step4'),
        ] as string[]).map((step, i) => (
          <div key={i} className="flex items-start gap-3">
            <span className="w-5 h-5 rounded-full bg-ruby text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
              {i + 1}
            </span>
            <p className="text-xs text-neutral-dk leading-relaxed">{step}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

const RecordingDashboard: React.FC<RecordingDashboardProps> = ({ runOutput }) => {
  const { t } = useTranslation()

  const {
    viewingTraceTestId,
    traceSteps,
    selectedTraceStepId,
    testByName,
    handleViewTrace,
    handleBackToResults,
    setSelectedTraceStepId
  } = useTraceViewer()

  let data: RSpecOutput | null = null
  try {
    data = JSON.parse(runOutput)
  } catch (error) {
    // Not a valid JSON, so we can't display the dashboard
  }

  if (!data) {
    return (
      <div className="p-4 w-full">
        <div className="border border-neutral-bdr rounded-lg bg-white">
          <EmptyState />
        </div>
      </div>
    )
  }

  const { examples, summary } = data
  const passedCount = summary.example_count - summary.failure_count - summary.pending_count
  const failedCount = summary.failure_count
  const skippedCount = summary.pending_count
  const totalCount = summary.example_count

  if (viewingTraceTestId) {
    return (
      <TraceViewer
        traceSteps={traceSteps}
        selectedTraceStepId={selectedTraceStepId}
        onSelectStep={setSelectedTraceStepId}
        onBack={handleBackToResults}
      />
    )
  }

  return (
    <div className="p-4 w-full flex flex-col gap-4">
      {/* Summary bar */}
      <div className="border border-neutral-bdr rounded-lg bg-white px-5 py-4">
        <p className="text-xs font-semibold text-neutral-mid uppercase tracking-wide mb-3">
          {t('dashboard.overallSummary')}
        </p>
        <div className="flex gap-3 flex-wrap">
          <div className="flex flex-col items-center px-4 py-2 rounded-lg border border-neutral-bdr bg-neutral-50 min-w-[64px]">
            <span className="text-lg font-bold text-neutral-dark">{totalCount}</span>
            <span className="text-xs text-neutral-mid">{t('dashboard.totalTests')}</span>
          </div>
          <div className="flex flex-col items-center px-4 py-2 rounded-lg border border-neutral-bdr bg-neutral-50 min-w-[64px]">
            <span className="text-lg font-bold text-status-ok">{passedCount}</span>
            <span className="text-xs text-neutral-mid">{t('dashboard.passed')}</span>
          </div>
          <div className="flex flex-col items-center px-4 py-2 rounded-lg border border-neutral-bdr bg-neutral-50 min-w-[64px]">
            <span className="text-lg font-bold text-status-err">{failedCount}</span>
            <span className="text-xs text-neutral-mid">{t('dashboard.failed')}</span>
          </div>
          <div className="flex flex-col items-center px-4 py-2 rounded-lg border border-neutral-bdr bg-neutral-50 min-w-[64px]">
            <span className="text-lg font-bold text-amber-500">{skippedCount}</span>
            <span className="text-xs text-neutral-mid">{t('dashboard.skipped')}</span>
          </div>
        </div>
      </div>

      {/* Chart + results */}
      <div className="flex flex-col md:flex-row gap-4">
        <PieChartWidget passed={passedCount} failed={failedCount} skipped={skippedCount} />

        <div className="flex-1 border border-neutral-bdr rounded-lg bg-white p-4 flex flex-col gap-2">
          {examples.map((example) => {
            const testInfo = testByName.get(example.description)
            return (
              <TestResultCard
                key={example.id}
                name={example.description}
                status={example.status}
                message={example.exception?.message ?? example.pending_message}
                backtrace={example.exception?.backtrace}
                hasTrace={testInfo?.hasTrace}
                onViewTrace={() => handleViewTrace(example.description)}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default RecordingDashboard
