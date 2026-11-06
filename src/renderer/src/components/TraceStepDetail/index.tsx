import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  rectOverlayStyle,
  type SnapshotData,
  type TraceViewStep
} from '@foundation/trace/viewModel'
import TraceSnapshotFrame from './TraceSnapshotFrame'
import TechnicalDetails from './TechnicalDetails'

interface TraceStepDetailProps {
  step: TraceViewStep | null
  devicePixelRatio: number
  traceKey?: string // identifies the open trace; the detail starts afresh when it changes
  headingLevel?: HeadingLevel // of the step's title; the view's heading is one below
}

type HeadingLevel = 2 | 3 | 4 | 5

type View = 'screenshot' | 'snapshot'

// What a load gave for one step; null means it couldn't be read.
type Loaded<T> = { stepId: string; value: T | null }

const Placeholder: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="w-full h-48 bg-neutral-lt rounded-lg flex items-center justify-center text-sm text-neutral-md">
    {children}
  </div>
)

const Detail: React.FC<Omit<TraceStepDetailProps, 'traceKey'>> = ({
  step,
  devicePixelRatio,
  headingLevel = 3
}) => {
  const { t } = useTranslation()
  const [view, setView] = useState<View>('screenshot')
  const [shot, setShot] = useState<Loaded<string> | null>(null)
  const [natural, setNatural] = useState<{ stepId: string; width: number; height: number } | null>(
    null
  )
  const [page, setPage] = useState<Loaded<SnapshotData> | null>(null)

  const id = step?.id ?? null
  const hasScreenshot = Boolean(step?.hasScreenshot && step.loadScreenshot)
  const hasSnapshot = Boolean(step?.hasSnapshot && step.loadSnapshot)
  const wantSnapshot = view === 'snapshot' && hasSnapshot

  // Loads are keyed by step id. A result that arrives after the selection
  // moved on is dropped, as is one that names another step.
  useEffect(() => {
    if (!id || !hasScreenshot || !step?.loadScreenshot) return
    let active = true
    step
      .loadScreenshot()
      .catch(() => null)
      .then((loaded) => {
        if (!active || (loaded && loaded.stepId !== id)) return
        setShot({ stepId: id, value: loaded?.dataUrl ?? null })
      })
    return (): void => {
      active = false
    }
    // Not keyed on the loader: a recorder re-map makes a new one per step.
  }, [id, hasScreenshot])

  // The page HTML loads only once its view is chosen, and once per step.
  const pageLoaded = page?.stepId === id && page.value !== null
  useEffect(() => {
    if (!id || !wantSnapshot || pageLoaded || !step?.loadSnapshot) return
    let active = true
    step
      .loadSnapshot()
      .catch(() => null)
      .then((loaded) => {
        if (!active || (loaded && loaded.stepId !== id)) return
        setPage({ stepId: id, value: loaded?.snapshot ?? null })
      })
    return (): void => {
      active = false
    }
    // Keyed on the step, not the loader, for the same reason as above.
  }, [id, wantSnapshot])

  if (!step) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-md text-sm p-4">
        {t('traceViewer.selectStep')}
      </div>
    )
  }

  // Only what was loaded for this step counts.
  const image = shot?.stepId === step.id ? shot : null
  const size = natural?.stepId === step.id ? natural : null
  const snapshot = page?.stepId === step.id ? page : null
  const overlay =
    image?.value && size && step.rect ? rectOverlayStyle(step.rect, devicePixelRatio, size) : null

  const title = step.title
  const titleText = title
    ? t(title.key, {
        ...title.values,
        ...(title.element ? { element: t(title.element.key, title.element.values) } : {})
      })
    : null

  const renderScreenshot = (): React.ReactNode => {
    if (!hasScreenshot) return <Placeholder>{t('traceViewer.notCaptured')}</Placeholder>
    if (!image) return <Placeholder>{t('traceViewer.loadingImage')}</Placeholder>
    if (!image.value) return <Placeholder>{t('traceViewer.notCaptured')}</Placeholder>
    return (
      <div className="relative">
        <img
          src={image.value}
          alt={t('traceViewer.stepImage', { n: step.number })}
          onLoad={(event) => {
            const { naturalWidth, naturalHeight } = event.currentTarget
            setNatural({ stepId: step.id, width: naturalWidth, height: naturalHeight })
          }}
          className="block w-full rounded-lg border border-neutral-bdr shadow-sm"
        />
        {overlay && (
          <div
            data-testid="trace-rect"
            role="img"
            aria-label={t('traceViewer.rectLabel')}
            title={t('traceViewer.rectLabel')}
            style={overlay}
            className="absolute border-2 border-ruby bg-ruby-glow pointer-events-none"
          />
        )}
      </div>
    )
  }

  const renderSnapshot = (): React.ReactNode => {
    if (!hasSnapshot) return <Placeholder>{t('traceViewer.notCaptured')}</Placeholder>
    if (!snapshot) return <Placeholder>{t('traceViewer.loadingImage')}</Placeholder>
    if (!snapshot.value) return <Placeholder>{t('traceViewer.notCaptured')}</Placeholder>
    return <TraceSnapshotFrame snapshot={snapshot.value} />
  }

  const Title = `h${headingLevel}` as const
  const ViewHeading = `h${headingLevel + 1}` as 'h3' | 'h4' | 'h5' | 'h6'

  const viewButton = (value: View): React.ReactNode => (
    <button
      type="button"
      aria-pressed={view === value}
      onClick={() => setView(value)}
      className={`px-3 py-1 text-xs rounded-full border ${
        view === value
          ? 'border-ruby bg-ruby-sub text-neutral-dark'
          : 'border-neutral-bdr text-neutral-md hover:bg-neutral-lt'
      }`}
    >
      {t(`traceViewer.view.${value}`)}
    </button>
  )

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 space-y-4">
      <div className="space-y-1">
        {titleText && (
          <Title className="text-base text-neutral-dark break-words">{titleText}</Title>
        )}
        {step.foundBy && <p className="text-xs text-neutral-md">{t(step.foundBy.key)}</p>}
        {step.status === 'failed' && (
          <p className="text-sm font-semibold text-status-err">{t('traceViewer.failedStep')}</p>
        )}
        <div className="flex gap-3 text-xs text-neutral-md">
          {step.waitedMs !== null && step.waitedMs > 0 && (
            <span>{t('traceViewer.waited', { seconds: (step.waitedMs / 1000).toFixed(1) })}</span>
          )}
          {step.retries > 0 && <span>{t('traceViewer.retries', { count: step.retries })}</span>}
        </div>
      </div>

      <div role="group" aria-label={t('traceViewer.view.label')} className="flex gap-2">
        {viewButton('screenshot')}
        {viewButton('snapshot')}
      </div>
      <section className="space-y-2">
        <ViewHeading className="text-xs font-semibold text-neutral-md">
          {t(`traceViewer.view.${view}`)}
        </ViewHeading>
        {view === 'screenshot' ? renderScreenshot() : renderSnapshot()}
      </section>

      {step.raw && <TechnicalDetails step={step.raw} />}
    </div>
  )
}

const TraceStepDetail: React.FC<TraceStepDetailProps> = ({ traceKey, ...props }) => (
  <Detail key={traceKey ?? 'recorder'} {...props} />
)

export default TraceStepDetail
