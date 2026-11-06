import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useRunStore } from '@foundation/Stores/runStore'
import useProjectStore from '@foundation/Stores/projectStore'
import useRecorderStore from '@foundation/Stores/recorderStore'
import { loadRaiderResults } from '@foundation/raiderResults'
import { fixInTestRoute, recordedTestForFile } from '@foundation/recordedTestForFile'
import { failedStepLine, resolveFailedStep } from '../../hooks/useFailedStep'
import MobileNotReady from '@components/MobileNotReady'
import Tooltip from '@components/Tooltip'
import {
  errorReason,
  progress,
  type RunTestView,
  type RunView,
  type TestState
} from '@foundation/run/runModel'

interface RunPanelProps {
  routeKey: string
  onRunAgain?: () => void
  onRerunFailed?: () => void
}

type Filter = 'all' | 'failed' | 'running' | 'queued'
const FILTERS: Filter[] = ['all', 'failed', 'running', 'queued']

const buttonClass =
  'text-xs px-2.5 py-1 rounded border border-neutral-bdr text-neutral-dk bg-white hover:bg-neutral-50 transition-colors font-medium'

const matches = (filter: Filter, state: TestState): boolean =>
  filter === 'all' ||
  (filter === 'failed' && state === 'failed') ||
  (filter === 'running' && state === 'started') ||
  (filter === 'queued' && state === 'queued')

const stateClass: Record<TestState, string> = {
  queued: 'bg-neutral-lt text-neutral-md',
  started: 'bg-neutral-lt text-neutral-dk',
  passed: 'bg-status-ok-bg text-status-ok',
  failed: 'bg-status-err-bg text-status-err',
  quarantined: 'bg-status-quarantine-bg text-status-quarantine',
  pending: 'bg-neutral-lt text-neutral-dk',
  skipped: 'bg-neutral-lt text-neutral-md'
}

const formatElapsed = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

const formatDuration = (ms: number): string =>
  ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`

/** The plain failed-step line for each failed recorded test of a finished run, by run test id. */
function useFailedStepLines(run: RunView | null, projectPath: string | null): Map<string, string> {
  const { t } = useTranslation()
  const suites = useRecorderStore((s) => s.suites)
  const finishedAt = run?.finished?.finishedAt
  const startedAt = run?.startedAt
  // Kept with the run it was read for: the next run never paints this one's lines
  const key =
    run && finishedAt && projectPath ? `${run.runId}\n${projectPath}\n${finishedAt}` : null
  const [shown, setShown] = useState<{ key: string | null; lines: Map<string, string> }>({
    key: null,
    lines: new Map()
  })

  // Only the failed rows of recorded tests are worth reading the results for
  const failed =
    run && finishedAt
      ? run.order
          .map((id) => run.tests[id])
          .filter((x) => x.state === 'failed')
          .flatMap((x) => {
            const recorded = recordedTestForFile(suites, x.file)
            return recorded ? [{ id: x.id, recorded }] : []
          })
      : []
  const failedKey = failed.map((f) => `${f.id}=${f.recorded.id}`).join('\n')
  const latest = useRef({ failed, t })
  latest.current = { failed, t }

  useEffect(() => {
    if (!key || !projectPath || !failedKey || !startedAt) return
    let active = true
    loadRaiderResults(projectPath, window.api)
      .then(async (rows) => {
        const next = new Map<string, string>()
        const { failed: wanted, t: translate } = latest.current
        for (const { id, recorded } of wanted) {
          // A run that wrote no results leaves the last run's file: it isn't this run's failure
          const row = rows?.find(
            (r) =>
              r.identifier === id &&
              !!r.finishedAt &&
              Date.parse(r.finishedAt) >= Date.parse(startedAt)
          )
          if (!row) continue
          const line = failedStepLine(
            translate,
            await resolveFailedStep(projectPath, recorded, row)
          )
          if (line) next.set(id, line)
        }
        if (active) setShown({ key, lines: next })
      })
      .catch(() => {})
    return (): void => {
      active = false
    }
    // Once per finished run: a suite edit in between doesn't read the results again
  }, [key, failedKey, startedAt])

  return shown.key === key ? shown.lines : new Map()
}

const RunPanel: React.FC<RunPanelProps> = ({ routeKey, onRunAgain, onRerunFailed }) => {
  const { t } = useTranslation()
  const run = useRunStore((s) => s.run)
  const origin = useRunStore((s) => s.origin)
  const notReady = useRunStore((s) => s.notReady)
  const projectPath = useProjectStore((s) => s.projectPath)
  const [filter, setFilter] = useState<Filter>('all')
  const [now, setNow] = useState(() => Date.now())
  const [detailsOpen, setDetailsOpen] = useState(false)
  const stepLines = useFailedStepLines(run, projectPath)
  const suites = useRecorderStore((s) => s.suites)

  const active = run !== null && run.finished === null
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [active])

  // A mobile run that didn't start says why where it was started from
  if (notReady && notReady.origin.route === routeKey && notReady.projectPath === projectPath) {
    return <MobileNotReady notReady={notReady} />
  }

  if (!run) return null

  if (projectPath && run.projectPath !== projectPath) {
    // Another project's result means nothing here
    if (!active) return null
    const project = run.projectPath.split(/[\\/]/).filter(Boolean).pop() ?? run.projectPath
    return (
      <div data-testid="run-panel" className="p-3 text-sm text-neutral-dk">
        {t('run.otherProject', { project })}
      </div>
    )
  }
  if (origin?.route !== routeKey) return null

  const { finished } = run
  const { done, total } = progress(run)
  const indeterminate = !finished && (run.phase === null || run.phase === 'booting' || total === 0)
  const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0
  const label = finished
    ? t(`run.result.${finished.status}`)
    : t(`run.phase.${run.phase ?? 'booting'}`)
  const end = finished ? Date.parse(finished.finishedAt) : now
  const elapsed = formatElapsed(end - Date.parse(run.startedAt))
  const tests = run.order.map((id) => run.tests[id]).filter((x) => matches(filter, x.state))
  const files = [...new Set(tests.map((x) => x.file))]
  const reason = finished?.status === 'errored' ? errorReason(run) : null
  const hasFailures =
    Object.values(run.tests).some((x) => x.state === 'failed') || (finished?.counts.failed ?? 0) > 0

  const row = (test: RunTestView): React.ReactElement => {
    const stepLine = stepLines.get(test.id)
    const recorded = stepLine ? recordedTestForFile(suites, test.file) : undefined
    return (
      <li
        key={test.id}
        data-testid="run-test-row"
        className="flex items-center gap-2 py-1.5 px-3 text-sm"
      >
        <span
          className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${stateClass[test.state]}`}
        >
          {t(`run.state.${test.state}`)}
        </span>
        <span className="flex-1 min-w-0 truncate text-neutral-dark">{test.description}</span>
        {run.workers > 1 && test.worker !== undefined && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-lt text-neutral-dk">
            {`w${test.worker}`}
          </span>
        )}
        {test.attempt !== undefined && test.attempt > 1 && (
          <span className="text-xs text-neutral-md">{`#${test.attempt}`}</span>
        )}
        {test.durationMs !== undefined && (
          <span className="text-xs text-neutral-md">{formatDuration(test.durationMs)}</span>
        )}
        {stepLine && recorded && (
          <>
            <span data-testid="run-failed-step-line" className="text-xs text-neutral-dk">
              {stepLine}
            </span>
            <Tooltip content={t('tooltips.failedStep.fixInTest')} position="top">
              <Link
                to={fixInTestRoute(recorded.id)}
                className="text-xs text-ruby hover:underline whitespace-nowrap"
              >
                {t('failedStep.fixInTest')}
              </Link>
            </Tooltip>
          </>
        )}
      </li>
    )
  }

  return (
    <div
      data-testid="run-panel"
      className="flex flex-col border border-neutral-bdr rounded-md bg-white"
    >
      <div className="flex items-center gap-3 p-3 border-b border-neutral-bdr">
        <span data-testid="run-phase" className="font-medium text-neutral-dark">
          {label}
        </span>
        <div data-testid="run-progress" className="flex items-center gap-2 flex-1 min-w-0">
          <div className="relative h-1.5 flex-1 rounded-full bg-neutral-lt overflow-hidden">
            {indeterminate ? (
              <div data-indeterminate className="absolute inset-y-0 w-1/3 bg-ruby animate-pulse" />
            ) : (
              <div className="h-full bg-ruby" style={{ width: `${percent}%` }} />
            )}
          </div>
          {!indeterminate && (
            <span className="text-xs text-neutral-dk whitespace-nowrap">
              {t('run.progress', { done, total })}
            </span>
          )}
        </div>
        <span className="text-xs text-neutral-md">{elapsed}</span>
        {!finished && (
          <Tooltip content={t('tooltips.runPanel.cancel')} position="bottom">
            <button
              data-testid="run-cancel"
              className={buttonClass}
              onClick={() => void useRunStore.getState().cancel()}
            >
              {t('run.cancel')}
            </button>
          </Tooltip>
        )}
        {finished && onRunAgain && (
          <Tooltip content={t('tooltips.runPanel.runAgain')} position="bottom">
            <button data-testid="run-again" className={buttonClass} onClick={onRunAgain}>
              {t('run.runAgain')}
            </button>
          </Tooltip>
        )}
        {finished && onRerunFailed && hasFailures && (
          <Tooltip content={t('tooltips.runPanel.rerunFailed')} position="bottom">
            <button
              data-testid="run-rerun-failed"
              className={buttonClass}
              title={t('run.rerunSerial')}
              onClick={onRerunFailed}
            >
              {t('run.rerunFailed')}
            </button>
          </Tooltip>
        )}
      </div>

      {reason && (
        <p data-testid="run-error-reason" className="px-3 py-2 text-xs text-neutral-dk">
          {reason}
        </p>
      )}

      {!run.liveEvents && (
        <p className="px-3 py-2 text-xs text-neutral-dk bg-neutral-lt">{t('run.updateReporter')}</p>
      )}

      <div data-testid="run-filter" className="flex gap-1 p-3 pb-0">
        {FILTERS.map((f) => (
          <Tooltip
            key={f}
            content={t(`tooltips.runPanel.filter${f[0].toUpperCase()}${f.slice(1)}`)}
            position="bottom"
          >
            <button
              aria-pressed={filter === f}
              className={`${buttonClass} ${filter === f ? 'bg-ruby-sub border-ruby' : ''}`}
              onClick={() => setFilter(f)}
            >
              {t(`run.filter.${f}`)}
            </button>
          </Tooltip>
        ))}
      </div>

      <div className="max-h-80 overflow-y-auto">
        {files.map((file) => (
          <div key={file}>
            <div className="px-3 pt-3 text-xs font-medium text-neutral-md truncate">{file}</div>
            <ul className="divide-y divide-neutral-bdr">
              {tests.filter((x) => x.file === file).map(row)}
            </ul>
          </div>
        ))}
      </div>

      <details
        data-testid="run-tech-details"
        className="border-t border-neutral-bdr p-3"
        open={detailsOpen}
        onToggle={(e) => setDetailsOpen(e.currentTarget.open)}
      >
        <summary className="text-xs text-neutral-dk cursor-pointer">
          {t('run.technicalDetails')}
        </summary>
        {(finished?.truncated || run.outputTrimmed) && (
          <p className="text-xs text-neutral-md mt-2">{t('run.trimmed')}</p>
        )}
        {/* Joining megabytes of output on every event is costly, so only while it's on show */}
        {detailsOpen && (
          <pre className="mt-2 p-2 rounded bg-black text-white text-xs overflow-auto whitespace-pre-wrap">
            {run.output
              .map((o) => (o.worker !== undefined ? `[w${o.worker}] ${o.chunk}` : o.chunk))
              .join('')}
          </pre>
        )}
      </details>
    </div>
  )
}

export default RunPanel
