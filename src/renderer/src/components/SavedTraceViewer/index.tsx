import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { FaTimes } from 'react-icons/fa'
import TraceTimeline from '@components/TraceTimeline'
import TraceStepDetail from '@components/TraceStepDetail'
import { TraceConsoleList, TraceNetworkList } from '@components/TraceEventLists'
import { eventsForStep, fromRaiderTrace } from '@foundation/trace/viewModel'
import type { RaiderTraceIndex } from '@shared/types/raiderTrace'

interface SavedTraceViewerProps {
  traceId: string
  index: RaiderTraceIndex
  onClose: () => void
}

type Tab = 'step' | 'network' | 'console'

const TABS: Tab[] = ['step', 'network', 'console']

const TRUNCATED: (keyof RaiderTraceIndex['truncated'])[] = [
  'steps',
  'screenshots',
  'snapshots',
  'network',
  'console'
]

const ShowAll: React.FC<{ checked: boolean; onChange: (all: boolean) => void }> = ({
  checked,
  onChange
}) => {
  const { t } = useTranslation()
  return (
    <label className="flex items-center gap-2 pb-2 text-xs text-neutral-mid">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {t('traceViewer.showAll')}
    </label>
  )
}

const SavedTraceViewer: React.FC<SavedTraceViewerProps> = ({ traceId, index, onClose }) => {
  const { t } = useTranslation()
  const idPrefix = useId()
  // Main drops a trace when the same file is opened again; say so once.
  const toldClosed = useRef(false)
  // The view is built once per trace, so its reader reads the current t.
  const tRef = useRef(t)
  useEffect(() => {
    tRef.current = t
  }, [t])
  const view = useMemo(
    () =>
      fromRaiderTrace(index, async (name) => {
        const result = await window.api.readTraceEntry(traceId, name)
        if (!result.ok && result.error === 'closed' && !toldClosed.current) {
          toldClosed.current = true
          toast.error(tRef.current('traceViewer.error.closed'))
        }
        return result
      }),
    [traceId, index]
  )
  const [selectedId, setSelectedId] = useState<string | null>(view.defaultSelectedId)
  const [tab, setTab] = useState<Tab>('step')
  const [networkAll, setNetworkAll] = useState(false)
  const [consoleAll, setConsoleAll] = useState(false)

  const step = selectedId ? (view.byId.get(selectedId) ?? null) : null
  const { test, browser, capabilities, truncated } = index
  const browserText = [browser.name, browser.version].filter(Boolean).join(' ')
  const removed = TRUNCATED.filter((key) => truncated[key] > 0)

  // Arrow keys move between tabs, as in any tab list.
  const onTabKey = (event: React.KeyboardEvent): void => {
    const at = TABS.indexOf(tab)
    const next = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: TABS.length - 1 }[
      event.key
    ]
    if (next === undefined) return
    event.preventDefault()
    const target = TABS[(next + TABS.length) % TABS.length]
    setTab(target)
    document.getElementById(`${idPrefix}-tab-${target}`)?.focus()
  }

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-start justify-between gap-4 px-6 py-3 border-b border-neutral-bdr">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-neutral-dark break-words">{test.fullName}</h2>
          <div className="flex flex-wrap gap-3 text-xs text-neutral-mid">
            {(test.status === 'passed' || test.status === 'failed') && (
              <span className={test.status === 'failed' ? 'text-status-err' : 'text-status-ok'}>
                {t(`traceViewer.status.${test.status}`)}
              </span>
            )}
            {test.attempt !== undefined && (
              <span>{t('traceViewer.attempt', { attempt: test.attempt })}</span>
            )}
            {browserText && <span>{browserText}</span>}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1 px-3 py-1 text-sm text-neutral-dk rounded border border-neutral-bdr hover:bg-neutral-lt"
        >
          <FaTimes aria-hidden="true" />
          {t('traceViewer.close')}
        </button>
      </header>

      {removed.length > 0 && (
        <ul className="px-6 py-2 text-xs text-neutral-mid bg-neutral-lt border-b border-neutral-bdr">
          {removed.map((key) => (
            <li key={key}>{t(`traceViewer.truncated.${key}`)}</li>
          ))}
        </ul>
      )}

      <div className="flex flex-1 min-h-0">
        <div className="w-[30%] border-r border-neutral-bdr overflow-y-auto">
          <TraceTimeline
            viewSteps={view.steps}
            traceKey={traceId}
            selectedStepId={selectedId}
            onSelectStep={setSelectedId}
          />
        </div>
        <div className="w-[70%] flex flex-col min-h-0">
          <div role="tablist" className="flex gap-1 px-4 pt-2 border-b border-neutral-bdr" onKeyDown={onTabKey}>
            {TABS.map((name) => (
              <button
                key={name}
                id={`${idPrefix}-tab-${name}`}
                type="button"
                role="tab"
                aria-selected={tab === name}
                aria-controls={`${idPrefix}-panel`}
                tabIndex={tab === name ? 0 : -1}
                onClick={() => setTab(name)}
                className={`px-3 py-1 text-sm border-b-2 ${
                  tab === name
                    ? 'border-ruby text-neutral-dark font-semibold'
                    : 'border-transparent text-neutral-mid hover:text-neutral-dk'
                }`}
              >
                {t(`traceViewer.tabs.${name}`)}
              </button>
            ))}
          </div>
          <div
            id={`${idPrefix}-panel`}
            role="tabpanel"
            aria-labelledby={`${idPrefix}-tab-${tab}`}
            className="flex-1 overflow-y-auto p-4"
          >
            {tab === 'step' && (
              <TraceStepDetail
                step={step}
                devicePixelRatio={view.devicePixelRatio}
                traceKey={traceId}
                headingLevel={3}
              />
            )}
            {tab === 'network' && (
              <>
                {capabilities.network && <ShowAll checked={networkAll} onChange={setNetworkAll} />}
                <TraceNetworkList
                  items={eventsForStep(index.network, step, networkAll)}
                  available={capabilities.network}
                  all={networkAll}
                />
              </>
            )}
            {tab === 'console' && (
              <>
                {capabilities.console && <ShowAll checked={consoleAll} onChange={setConsoleAll} />}
                <TraceConsoleList
                  items={eventsForStep(index.console, step, consoleAll)}
                  available={capabilities.console}
                  all={consoleAll}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default SavedTraceViewer
