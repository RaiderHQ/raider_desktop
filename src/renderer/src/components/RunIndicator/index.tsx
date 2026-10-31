import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useRunStore } from '@foundation/Stores/runStore'
import { progress } from '@foundation/run/runModel'

const RESULT_DISPLAY_MS = 10_000
// Restoring after a reload sets the origin to Overview; this covers a run with none yet
const FALLBACK_ROUTE = '/overview'

const RunIndicator: React.FC = (): JSX.Element | null => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const run = useRunStore((state) => state.run)
  const origin = useRunStore((state) => state.origin)
  const isActive = useRunStore((state) => state.isActive)
  const [showResult, setShowResult] = useState(false)
  const sawActive = useRef(false)

  const finished = run?.finished ?? null
  const runId = run?.runId

  // Only a run seen going counts; a finished run restored after a reload stays quiet
  useEffect(() => {
    if (isActive) {
      sawActive.current = true
      setShowResult(false)
      return
    }
    if (!finished || !sawActive.current) return
    sawActive.current = false
    setShowResult(true)
    const timer = setTimeout(() => setShowResult(false), RESULT_DISPLAY_MS)
    return (): void => clearTimeout(timer)
  }, [isActive, finished, runId])

  const route = origin?.route ?? FALLBACK_ROUTE
  // Overview's tabs live under /overview, and the run panel shows on all of them
  const onOrigin =
    route === '/overview'
      ? pathname === route || pathname.startsWith('/overview/')
      : pathname === route
  if (!run || onOrigin) return null

  let label: string
  if (isActive) {
    const { done, total } = progress(run)
    if (total > 0 && run.phase !== 'installing' && run.phase !== 'booting') {
      label = t('run.indicator.running', { done, total })
    } else {
      label = t(`run.phase.${run.phase ?? 'booting'}`)
    }
  } else if (showResult && finished) {
    label =
      finished.counts.failed > 0
        ? t('run.indicator.failed', { count: finished.counts.failed })
        : t(`run.result.${finished.status}`)
  } else {
    return null
  }

  return (
    <button
      type="button"
      data-testid="run-indicator"
      aria-label={t('run.indicator.show')}
      onClick={() => navigate(route)}
      className="flex items-center gap-2 rounded-full border border-neutral-bdr px-3 py-1 text-sm text-neutral-dark hover:border-ruby transition-colors"
    >
      {isActive && (
        <span
          aria-hidden="true"
          className="h-3 w-3 border-2 border-neutral-bdr border-t-ruby rounded-full animate-spin"
        />
      )}
      <span>{label}</span>
    </button>
  )
}

export default RunIndicator
