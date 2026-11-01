import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import useProjectStore from '@foundation/Stores/projectStore'
import { useRunStore } from '@foundation/Stores/runStore'
import useRecorderStore from '@foundation/Stores/recorderStore'
import PieChartWidget from '@components/PieChartWidget'
import TestResultCard from '@components/TestResultCard'
import NoProjectLoadedMessage from '@components/NoProjectLoadedMessage'
import { loadRaiderResults } from '@foundation/raiderResults'
import type { TestResult } from '@foundation/Types/testResult'

const EmptyState: React.FC = () => {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center justify-center py-14 px-6">
      <div className="w-12 h-12 rounded-full bg-neutral-100 border border-neutral-bdr flex items-center justify-center mb-4">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-neutral-mid"
        >
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      </div>
      <h3 className="text-sm font-semibold text-neutral-dark mb-1">
        {t('dashboard.noResults.title')}
      </h3>
      <p className="text-xs text-neutral-mid text-center mb-6 max-w-xs">
        {t('dashboard.noResults.subtitle')}
      </p>
      <div className="space-y-3 w-full max-w-sm">
        {(
          [
            t('dashboard.noResults.step1'),
            t('dashboard.noResults.step2'),
            t('dashboard.noResults.step3')
          ] as string[]
        ).map((step, i) => (
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

interface ResultSectionProps {
  titleKey: string
  results: TestResult[]
  keyPrefix: string
  testByName: Map<string, { id: string; hasTrace?: boolean }>
  projectPath?: string
}

const ResultSection: React.FC<ResultSectionProps> = ({
  titleKey,
  results,
  keyPrefix,
  testByName,
  projectPath
}) => {
  const { t } = useTranslation()
  if (results.length === 0) return null
  return (
    <div>
      <p className="text-xs font-semibold text-neutral-mid uppercase tracking-wide mb-2">
        {t(titleKey)}
      </p>
      <div className="flex flex-col gap-2">
        {results.map((result, index) => {
          const testInfo = testByName.get(result.name)
          return (
            <TestResultCard
              key={`${keyPrefix}-${index}`}
              name={result.name}
              status={result.status}
              screenshot={result.screenshot}
              video={result.video}
              message={result.statusDetails?.message}
              traceTestId={testInfo?.hasTrace ? testInfo.id : undefined}
              failure={result.failure}
              durationMs={result.durationMs}
              browser={result.browser}
              projectPath={projectPath}
            />
          )
        })}
      </div>
    </div>
  )
}

const Index: React.FC = (): JSX.Element => {
  const { t } = useTranslation()
  const [results, setResults] = useState<TestResult[]>([])
  const [hasReport, setHasReport] = useState(false)
  const projectPath: string | null = useProjectStore((state) => state.projectPath)
  const suites = useRecorderStore((s) => s.suites)
  // A finished run of this project rewrites raider-results, so the dashboard reloads
  const lastRunFinishedAt = useRunStore((s) =>
    s.run && s.run.projectPath === projectPath ? (s.run.finished?.finishedAt ?? null) : null
  )

  const testByName = new Map<string, { id: string; hasTrace?: boolean }>()
  for (const suite of suites) {
    for (const test of suite.tests) {
      testByName.set(test.name, { id: test.id, hasTrace: test.hasTrace })
    }
  }

  useEffect(() => {
    let active = true
    const fetchDashboard = async (): Promise<void> => {
      try {
        const exists = await window.api.reportExists(projectPath as string)
        if (active) setHasReport(exists)
      } catch {
        if (active) setHasReport(false)
      }
      try {
        const raider = await loadRaiderResults(projectPath as string, window.api, (file, message) =>
          toast.error(`${t('dashboard.error.parsing', { file })}: ${message}`)
        )
        if (!active) return
        setResults(raider ?? [])
      } catch (error: unknown) {
        // missing raider-results: show the empty state
        if (active) {
          setResults([])
          setHasReport(false)
        }
      }
    }
    if (projectPath) {
      fetchDashboard()
    }
    return (): void => {
      active = false
    }
  }, [projectPath, lastRunFinishedAt, t])

  const recheck = async (): Promise<void> => {
    try {
      setHasReport(await window.api.reportExists(projectPath as string))
    } catch {
      setHasReport(false)
    }
  }

  const openReport = async (): Promise<void> => {
    const result = await window.api.openReport(projectPath as string)
    if (!result.success) toast.error(`${t('dashboard.error.openReport')}: ${result.error ?? ''}`)
  }

  const passedTests = results.filter((r) => r.status === 'passed')
  const failedTests = results.filter((r) => r.status === 'failed' || r.status === 'broken')
  const skippedTests = results.filter((r) => r.status === 'skipped')
  const quarantinedTests = results.filter((r) => r.status === 'quarantined')

  const passedCount = passedTests.length
  const failedCount = failedTests.length
  const skippedCount = skippedTests.length
  const quarantinedCount = quarantinedTests.length
  const totalCount = results.length

  if (!projectPath) {
    return <NoProjectLoadedMessage />
  }

  return (
    <div className="p-4 w-full flex flex-col gap-4">
      <div className="flex justify-end">
        <span onMouseEnter={recheck}>
          <button
            type="button"
            onClick={openReport}
            disabled={!hasReport}
            className="px-3 py-1.5 text-xs font-semibold rounded-md bg-ruby text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {t('dashboard.openReport')}
          </button>
        </span>
      </div>
      {totalCount === 0 ? (
        <div className="border border-neutral-bdr rounded-lg bg-white">
          <EmptyState />
        </div>
      ) : (
        <>
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
                <span className="text-lg font-bold text-status-quarantine">{quarantinedCount}</span>
                <span className="text-xs text-neutral-mid">{t('dashboard.quarantined')}</span>
              </div>
              <div className="flex flex-col items-center px-4 py-2 rounded-lg border border-neutral-bdr bg-neutral-50 min-w-[64px]">
                <span className="text-lg font-bold text-amber-500">{skippedCount}</span>
                <span className="text-xs text-neutral-mid">{t('dashboard.skipped')}</span>
              </div>
            </div>
          </div>

          {/* Chart + results */}
          <div className="flex flex-col md:flex-row gap-4">
            <PieChartWidget
              passed={passedCount}
              failed={failedCount}
              skipped={skippedCount}
              quarantined={quarantinedCount}
            />

            <div className="flex-1 border border-neutral-bdr rounded-lg bg-white p-4 flex flex-col gap-4">
              <ResultSection
                titleKey="dashboard.passed"
                results={passedTests}
                keyPrefix="passed"
                testByName={testByName}
                projectPath={projectPath}
              />
              <ResultSection
                titleKey="dashboard.failed"
                results={failedTests}
                keyPrefix="failed"
                testByName={testByName}
                projectPath={projectPath}
              />
              <ResultSection
                titleKey="dashboard.quarantined"
                results={quarantinedTests}
                keyPrefix="quarantined"
                testByName={testByName}
                projectPath={projectPath}
              />
              <ResultSection
                titleKey="dashboard.skipped"
                results={skippedTests}
                keyPrefix="skipped"
                testByName={testByName}
                projectPath={projectPath}
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default Index
