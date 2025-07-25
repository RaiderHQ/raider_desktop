import React from 'react'
import { useTranslation } from 'react-i18next'
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

const RecordingDashboard: React.FC<RecordingDashboardProps> = ({ runOutput }) => {
  const { t } = useTranslation()

  let data: RSpecOutput | null = null
  try {
    data = JSON.parse(runOutput)
  } catch (error) {
    // Not a valid JSON, so we can't display the dashboard
  }

  if (!data) {
    return (
      <div className="text-center text-gray-600 text-lg font-semibold p-6 border rounded bg-white shadow">
        {t('dashboard.noRecordingResults')}
      </div>
    )
  }

  const { examples, summary } = data
  const passedCount = summary.example_count - summary.failure_count - summary.pending_count
  const failedCount = summary.failure_count
  const skippedCount = summary.pending_count
  const totalCount = summary.example_count

  return (
    <div className="p-2 min-h-fit sm:p-4 md:p-6 w-full flex flex-col">
      <div className="mb-2 sm:mb-4 md:mb-6 p-4 border rounded bg-white">
        <h2 className="text-2xl font-bold mb-2">{t('dashboard.overallSummary')}</h2>
        <p className="text-lg">
          {t('dashboard.totalTests')}: <span className="font-semibold">{totalCount}</span>
        </p>
        <p className="text-lg">
          {t('dashboard.passed')}:{' '}
          <span className="font-semibold text-[#4caf50]">{passedCount}</span>
        </p>
        <p className="text-lg">
          {t('dashboard.failed')}:{' '}
          <span className="font-semibold text-[#f44336]">{failedCount}</span>
        </p>
        <p className="text-lg">
          {t('dashboard.skipped')}:{' '}
          <span className="font-semibold text-[#ff9800]">{skippedCount}</span>
        </p>
      </div>

      <div className="flex flex-1 flex-col md:flex-row gap-4 sm:gap-6 md:gap-8">
        <div className="items-center">
          <PieChartWidget passed={passedCount} failed={failedCount} skipped={skippedCount} />
        </div>

        <div className="flex-1 flex flex-col border rounded shadow p-4 h-min">
          <div className="flex flex-col gap-4">
            {examples.map((example) => (
              <TestResultCard
                key={example.id}
                name={example.description}
                status={example.status}
                message={example.pending_message}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default RecordingDashboard
