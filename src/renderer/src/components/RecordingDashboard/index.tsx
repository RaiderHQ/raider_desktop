import React from 'react'
import { useTranslation } from 'react-i18next'
import useRecorderStore from '@foundation/Stores/recorderStore'
import PieChartWidget from '@components/PieChartWidget'
import TestResultCard from '@components/TestResultCard'

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
  /** The last run failed: without results to show, say so instead of how to record */
  runFailed?: boolean
}

const isRspecOutput = (value: unknown): value is RSpecOutput => {
  const data = value as RSpecOutput | null
  return (
    typeof data === 'object' &&
    data !== null &&
    Array.isArray(data.examples) &&
    typeof data.summary === 'object' &&
    data.summary !== null
  )
}

const STDOUT_MARKER = '--- STDOUT ---'

/**
 * rspec's JSON results inside a run's output. A failed run may carry stderr
 * ahead of it (main's "--- STDOUT ---" section), and a spec may print text
 * before it, so the JSON is looked for rather than expected to be the whole text.
 */
function parseRspecOutput(runOutput: string): RSpecOutput | null {
  const marker = runOutput.lastIndexOf(STDOUT_MARKER)
  const text = marker === -1 ? runOutput : runOutput.slice(marker + STDOUT_MARKER.length)
  const end = text.lastIndexOf('}')
  let start = text.indexOf('{')
  for (let tries = 0; start !== -1 && start < end && tries < 50; tries++) {
    try {
      const parsed: unknown = JSON.parse(text.slice(start, end + 1))
      if (isRspecOutput(parsed)) return parsed
    } catch {
      // Not the start of the results: try the next brace
    }
    start = text.indexOf('{', start + 1)
  }
  return null
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

const RunFailedState: React.FC<{ output: string }> = ({ output }) => {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col py-8 px-6 gap-3">
      <h3 className="text-sm font-semibold text-status-err">{t('dashboard.runFailed.title')}</h3>
      <p className="text-xs text-neutral-mid">{t('dashboard.runFailed.subtitle')}</p>
      {/* The raw output is for whoever fixes the project, so it stays folded away */}
      <details>
        <summary className="text-xs text-neutral-dk cursor-pointer">
          {t('dashboard.runFailed.details')}
        </summary>
        <pre className="mt-2 text-xs text-neutral-dk bg-neutral-50 border border-neutral-bdr rounded p-3 whitespace-pre-wrap break-words max-h-80 overflow-y-auto">
          {output}
        </pre>
      </details>
    </div>
  )
}

const RecordingDashboard: React.FC<RecordingDashboardProps> = ({ runOutput, runFailed }) => {
  const { t } = useTranslation()
  const suites = useRecorderStore((s) => s.suites)

  const testByName = new Map<string, { id: string; hasTrace?: boolean }>()
  for (const suite of suites) {
    for (const test of suite.tests) {
      testByName.set(test.name, { id: test.id, hasTrace: test.hasTrace })
    }
  }

  const data = parseRspecOutput(runOutput)

  if (!data) {
    return (
      <div className="p-4 w-full">
        <div className="border border-neutral-bdr rounded-lg bg-white">
          {runFailed && runOutput ? <RunFailedState output={runOutput} /> : <EmptyState />}
        </div>
      </div>
    )
  }

  const { examples, summary } = data
  const passedCount = summary.example_count - summary.failure_count - summary.pending_count
  const failedCount = summary.failure_count
  const skippedCount = summary.pending_count
  const totalCount = summary.example_count

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
                traceTestId={testInfo?.hasTrace ? testInfo.id : undefined}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default RecordingDashboard
