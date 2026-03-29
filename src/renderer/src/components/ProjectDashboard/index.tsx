import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import useProjectStore from '@foundation/Stores/projectStore'
import PieChartWidget from '@components/PieChartWidget'
import TestResultCard from '@components/TestResultCard'
import TraceViewer from '@components/TraceViewer'
import NoProjectLoadedMessage from '@components/NoProjectLoadedMessage'
import { useTraceViewer } from '../../hooks/useTraceViewer'

interface Attachment {
  name: string
  type: string
  source: string
}

interface StatusDetails {
  message?: string
  trace?: string
}

interface TestResult {
  name: string
  status: string
  attachments?: Attachment[]
  screenshot?: string
  statusDetails?: StatusDetails
}

const EmptyState: React.FC = () => {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center justify-center py-14 px-6">
      <div className="w-12 h-12 rounded-full bg-neutral-100 border border-neutral-bdr flex items-center justify-center mb-4">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-mid">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      </div>
      <h3 className="text-sm font-semibold text-neutral-dark mb-1">{t('dashboard.noResults.title')}</h3>
      <p className="text-xs text-neutral-mid text-center mb-6 max-w-xs">{t('dashboard.noResults.subtitle')}</p>
      <div className="space-y-3 w-full max-w-sm">
        {([
          t('dashboard.noResults.step1'),
          t('dashboard.noResults.step2'),
          t('dashboard.noResults.step3'),
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

const Index: React.FC = (): JSX.Element => {
  const { t } = useTranslation()
  const [results, setResults] = useState<TestResult[]>([])
  const projectPath: string | null = useProjectStore((state) => state.projectPath)

  const {
    viewingTraceTestId,
    traceSteps,
    selectedTraceStepId,
    testByName,
    handleViewTrace,
    handleBackToResults,
    setSelectedTraceStepId
  } = useTraceViewer()

  useEffect(() => {
    const fetchDashboard = async (): Promise<void> => {
      try {
        const folderPath = `${projectPath}/allure-results`
        const fileNodes = await window.api.readDirectory(folderPath)
        const resultFiles = fileNodes.filter(
          (file: { name: string; type: string; path: string }) =>
            file.type === 'file' && file.name.toLowerCase().includes('result')
        )
        const promises = resultFiles.map(async (file: { name: string; path: string }) => {
          const res = await window.api.readFile(file.path)
          if (res.success && res.data) {
            try {
              return JSON.parse(res.data)
            } catch (e: unknown) {
              const error = e as Error
              toast.error(`${t('dashboard.error.parsing', { file: file.name })}: ${error.message}`)
              return null
            }
          } else {
            toast.error(`${t('dashboard.error.reading', { file: file.name })}: ${res.error}`)
            return null
          }
        })
        const fileData = await Promise.all(promises)
        let aggregated: TestResult[] = []
        fileData.forEach((data) => {
          if (data) {
            if (Array.isArray(data)) {
              aggregated = aggregated.concat(data)
            } else {
              aggregated.push(data)
            }
          }
        })

        const resultsWithMedia = aggregated.map((result) => {
          if (result.attachments && result.attachments.length > 0) {
            const attachment = result.attachments[0]
            result.screenshot = `${projectPath}/allure-results/${attachment.source}`
          }
          if (result.statusDetails?.message) {
            let msg = result.statusDetails.message
            msg = msg.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFD]/g, '')
            const encodingErrIdx = msg.indexOf('Unable to encode string')
            if (encodingErrIdx !== -1) {
              msg = msg.substring(0, encodingErrIdx).trim() || msg.substring(0, 500)
            }
            if (msg.length > 20000) {
              msg = msg.substring(0, 20000) + '\n… (message truncated)'
            }
            result.statusDetails.message = msg
          }
          return result
        })
        setResults(resultsWithMedia)
      } catch (error: unknown) {
        // silently ignore missing allure-results
      }
    }
    if (projectPath) {
      fetchDashboard()
    }
  }, [projectPath, t])

  const passedTests = results.filter((r) => r.status === 'passed')
  const failedTests = results.filter((r) => r.status === 'failed' || r.status === 'broken')
  const skippedTests = results.filter((r) => r.status === 'skipped')

  const passedCount = passedTests.length
  const failedCount = failedTests.length
  const skippedCount = skippedTests.length
  const totalCount = results.length

  if (!projectPath) {
    return <NoProjectLoadedMessage />
  }

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
                <span className="text-lg font-bold text-amber-500">{skippedCount}</span>
                <span className="text-xs text-neutral-mid">{t('dashboard.skipped')}</span>
              </div>
            </div>
          </div>

          {/* Chart + results */}
          <div className="flex flex-col md:flex-row gap-4">
            <PieChartWidget passed={passedCount} failed={failedCount} skipped={skippedCount} />

            <div className="flex-1 border border-neutral-bdr rounded-lg bg-white p-4 flex flex-col gap-4">
              {passedTests.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-neutral-mid uppercase tracking-wide mb-2">
                    {t('dashboard.passed')}
                  </p>
                  <div className="flex flex-col gap-2">
                    {passedTests.map((result, index) => {
                      const testInfo = testByName.get(result.name)
                      return (
                        <TestResultCard
                          key={`passed-${index}`}
                          name={result.name}
                          status={result.status}
                          screenshot={result.screenshot}
                          message={result.statusDetails?.message}
                          hasTrace={testInfo?.hasTrace}
                          onViewTrace={() => handleViewTrace(result.name)}
                        />
                      )
                    })}
                  </div>
                </div>
              )}
              {failedTests.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-neutral-mid uppercase tracking-wide mb-2">
                    {t('dashboard.failed')}
                  </p>
                  <div className="flex flex-col gap-2">
                    {failedTests.map((result, index) => {
                      const testInfo = testByName.get(result.name)
                      return (
                        <TestResultCard
                          key={`failed-${index}`}
                          name={result.name}
                          status={result.status}
                          screenshot={result.screenshot}
                          message={result.statusDetails?.message}
                          hasTrace={testInfo?.hasTrace}
                          onViewTrace={() => handleViewTrace(result.name)}
                        />
                      )
                    })}
                  </div>
                </div>
              )}
              {skippedTests.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-neutral-mid uppercase tracking-wide mb-2">
                    {t('dashboard.skipped')}
                  </p>
                  <div className="flex flex-col gap-2">
                    {skippedTests.map((result, index) => (
                      <TestResultCard
                        key={`skipped-${index}`}
                        name={result.name}
                        status={result.status}
                        screenshot={result.screenshot}
                        message={result.statusDetails?.message}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default Index
