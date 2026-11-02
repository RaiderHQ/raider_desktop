import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { TraceStep } from '@foundation/Types/traceStep'
import { fromRecorderTrace, type TraceViewStep } from '@foundation/trace/viewModel'
import { useInView } from '@foundation/trace/useInView'
import { useTranslation } from 'react-i18next'

interface TraceTimelineProps {
  steps?: TraceStep[] // the recorder's trace; scrolls to the latest step
  viewSteps?: TraceViewStep[] // a saved trace
  traceKey?: string // identifies the open trace; rows start afresh when it changes
  selectedStepId: string | null
  onSelectStep: (stepId: string) => void
}

const descendantIds = (step: TraceViewStep): string[] =>
  step.children.flatMap((child) => [child.id, ...descendantIds(child)])

const statusClass = (step: TraceViewStep, isSelected: boolean): string => {
  if (isSelected) return 'border-ruby bg-ruby-sub'
  if (step.status === 'failed') return 'border-status-err bg-status-err-bg'
  return 'border-neutral-bdr bg-white hover:bg-neutral-lt'
}

interface StepRowProps {
  step: TraceViewStep
  isSelected: boolean
  depth: number
  expanded: boolean
  tabbable: boolean
  onToggle: (step: TraceViewStep) => void
  onSelect: (id: string) => void
}

const StepRow: React.FC<StepRowProps> = ({
  step,
  isSelected,
  depth,
  expanded,
  tabbable,
  onToggle,
  onSelect
}) => {
  const { t } = useTranslation()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const inView = useInView(buttonRef)
  const [thumbnail, setThumbnail] = useState<string | null>(null)
  const { id, hasScreenshot, loadScreenshot } = step

  // Loads once when the row first shows; a result for another step is dropped.
  useEffect(() => {
    if (!inView || !hasScreenshot || !loadScreenshot || thumbnail) return
    let live = true
    loadScreenshot()
      .then((loaded) => {
        if (live && loaded && loaded.stepId === id) setThumbnail(loaded.dataUrl)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
    // Not keyed on loadScreenshot: a recorder re-map makes a new loader per step.
    // A different trace remounts the rows (see traceKey), so nothing carries over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, hasScreenshot, id])

  const title = step.title
  const titleText = title
    ? t(title.key, {
        ...title.values,
        ...(title.element ? { element: t(title.element.key, title.element.values) } : {})
      })
    : null
  const seconds = (step.offsetMs / 1000).toFixed(1)

  return (
    <div className="flex items-start gap-1" style={{ marginLeft: depth * 16 }}>
      <button
        ref={buttonRef}
        type="button"
        data-step-id={id}
        data-status={step.status}
        role="option"
        aria-selected={isSelected}
        aria-current={isSelected ? 'true' : undefined}
        tabIndex={tabbable ? 0 : -1}
        onClick={() => onSelect(id)}
        className={`flex flex-col flex-1 min-w-0 p-2 rounded-lg border text-left transition-colors ${statusClass(step, isSelected)}`}
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-bold text-neutral-mid w-5 text-center">{step.number}</span>
          <span className="text-xs text-neutral-mid">+{seconds}s</span>
          {step.waitedMs !== null && step.waitedMs >= 100 && (
            <span className="text-xs text-neutral-mid">
              {t('traceViewer.waited', { seconds: (step.waitedMs / 1000).toFixed(1) })}
            </span>
          )}
        </div>
        {titleText && <span className="text-sm text-neutral-dark mb-1 break-words">{titleText}</span>}
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={title ? t('traceViewer.stepImage', { n: step.number }) : `Step ${step.number}`}
            className="w-full h-20 object-cover rounded border border-neutral-lt"
          />
        ) : (
          (hasScreenshot || !title) && (
            <div className="w-full h-20 bg-neutral-lt rounded flex items-center justify-center text-xs text-neutral-mid">
              {title ? t('traceViewer.loadingImage') : '...'}
            </div>
          )
        )}
      </button>
      {step.isGroup && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={expanded ? t('traceViewer.collapseGroup') : t('traceViewer.expandGroup')}
          onClick={() => onToggle(step)}
          className="p-2 text-xs text-neutral-mid rounded hover:bg-neutral-lt"
        >
          {expanded ? '▾' : '▸'}
        </button>
      )}
    </div>
  )
}

const Timeline: React.FC<Omit<TraceTimelineProps, 'traceKey'>> = ({
  steps,
  viewSteps,
  selectedStepId,
  onSelectStep
}): JSX.Element => {
  const { t } = useTranslation()
  const listRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const recorderSteps = useMemo(
    () => (steps ? fromRecorderTrace(steps, window.api.readImage) : null),
    [steps]
  )
  const rows = viewSteps ?? recorderSteps ?? []
  const autoScroll = viewSteps === undefined

  // Auto-scroll to latest recorder step
  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView?.({ behavior: 'smooth' })
  }, [autoScroll, rows.length])

  const toggle = (step: TraceViewStep): void => {
    const collapsing = !collapsed.has(step.id)
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (!next.delete(step.id)) next.add(step.id)
      return next
    })
    // Don't leave the selection on a row that just disappeared.
    if (collapsing && selectedStepId && descendantIds(step).includes(selectedStepId)) {
      onSelectStep(step.id)
    }
  }

  const visibleIds: string[] = []
  const collect = (list: TraceViewStep[]): void => {
    for (const step of list) {
      visibleIds.push(step.id)
      if (step.isGroup && !collapsed.has(step.id)) collect(step.children)
    }
  }
  collect(rows)
  // Only one row is a tab stop: the selected one, else the first.
  const tabStopId =
    selectedStepId && visibleIds.includes(selectedStepId) ? selectedStepId : visibleIds[0]

  // Arrow keys move through the visible rows and select as they go.
  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    const buttons = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>('button[data-step-id]') ?? []
    )
    const at = buttons.findIndex((b) => b === event.target)
    if (at < 0) return
    const target = {
      ArrowDown: at + 1,
      ArrowUp: at - 1,
      Home: 0,
      End: buttons.length - 1
    }[event.key] as number
    const next = buttons[target]
    if (!next) return
    event.preventDefault()
    next.focus()
    onSelectStep(next.dataset.stepId as string)
  }

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-mid text-sm p-4">
        {t('recorder.traceTimeline.noTrace')}
      </div>
    )
  }

  const renderRows = (list: TraceViewStep[], depth: number): React.ReactNode =>
    list.map((step) => {
      const expanded = !collapsed.has(step.id)
      return (
        <React.Fragment key={step.id}>
          <StepRow
            step={step}
            isSelected={step.id === selectedStepId}
            depth={depth}
            expanded={expanded}
            tabbable={step.id === tabStopId}
            onToggle={toggle}
            onSelect={onSelectStep}
          />
          {step.isGroup && expanded && renderRows(step.children, depth + 1)}
        </React.Fragment>
      )
    })

  return (
    <div className="flex flex-col h-full overflow-y-auto p-2 space-y-2">
      {autoScroll && (
        <h4 className="text-sm font-semibold text-neutral-dk px-1">
          {t('recorder.traceTimeline.title')}
        </h4>
      )}
      <div ref={listRef} role="listbox" aria-label={t('traceViewer.stepList')} className="flex flex-col space-y-2" onKeyDown={onKeyDown}>
        {renderRows(rows, 0)}
      </div>
      <div ref={bottomRef} />
    </div>
  )
}

const TraceTimeline: React.FC<TraceTimelineProps> = ({ traceKey, ...props }) => (
  <Timeline key={traceKey ?? 'recorder'} {...props} />
)

export default TraceTimeline
