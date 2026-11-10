import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import toast from 'react-hot-toast'
import DocsLink from '@components/DocsLink'
import Tooltip from '@components/Tooltip'
import useProjectStore from '@foundation/Stores/projectStore'
import useRubyStore from '@foundation/Stores/rubyStore'
import { useRunStore } from '@foundation/Stores/runStore'
import type { FlowCliError, FlowsStatus } from '@shared/types/flows'
import FlowRow, { rowButton } from './FlowRow'
import { cliErrorText, mergeFlows, type FlowRowData } from './flowText'

type View =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | Exclude<FlowsStatus, { state: 'ready' }>
  | { state: 'ready'; rows: FlowRowData[]; listError: string | null }

const isError = (value: unknown): value is FlowCliError =>
  typeof value === 'object' && value !== null && 'error' in value

/**
 * The Flows tab: whether the project can have flows, setting them up, and one row per flow.
 * refresh() reloads everything; an answer to an older refresh is dropped.
 */
const FlowsPane: React.FC = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const projectPath = useProjectStore((s) => s.projectPath)
  const [view, setView] = useState<View>({ state: 'loading' })
  const [settingUp, setSettingUp] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const generation = useRef(0)

  const refresh = useCallback(async (): Promise<void> => {
    const mine = ++generation.current
    const current = (): boolean => mine === generation.current
    const rubyCommand = useRubyStore.getState().rubyCommand
    try {
      const status = await window.api.flowsStatus(rubyCommand ?? '')
      if (!current()) return
      if (isError(status)) {
        setView({ state: 'error', message: cliErrorText(t, status) })
        return
      }
      if (status.state !== 'ready') {
        setView(status)
        return
      }
      if (!rubyCommand) {
        setView({ state: 'error', message: t('flows.noRuby') })
        return
      }
      const [entries, flows, schedules] = await Promise.all([
        window.api.listProjectFlows(),
        window.api.listFlows(rubyCommand),
        window.api.listSchedules(rubyCommand)
      ])
      if (!current()) return
      // The rows come from the project; a gem answer that failed only loses its column
      const failed = [flows, schedules].find(isError)
      setNow(new Date())
      setView({
        state: 'ready',
        rows: mergeFlows(
          entries,
          isError(flows) ? [] : flows.flows,
          isError(schedules) ? [] : schedules.schedules
        ),
        listError: failed ? cliErrorText(t, failed) : null
      })
    } catch (error) {
      if (current())
        setView({ state: 'error', message: error instanceof Error ? error.message : String(error) })
    }
  }, [t])

  // On show and on a project switch; again whenever the window comes back to the front
  useEffect(() => {
    void refresh()
    const onFocus = (): void => void refresh()
    window.addEventListener('focus', onFocus)
    return (): void => {
      window.removeEventListener('focus', onFocus)
      // Whatever is still in flight answers for a pane that is gone
      generation.current++
    }
  }, [refresh, projectPath])

  // A scheduled run or a schedule changed under .raider/flows/ (main watches the folder)
  useEffect(() => window.api.onFlowsChanged(() => void refresh()), [refresh])

  // A flow run that finished has a new last result
  const finishedFlow = useRunStore((s) =>
    s.run?.finished?.flow ? s.run.finished.finishedAt : null
  )
  useEffect(() => {
    if (finishedFlow) void refresh()
  }, [finishedFlow, refresh])

  const setUp = async (): Promise<void> => {
    const rubyCommand = useRubyStore.getState().rubyCommand
    if (!rubyCommand) {
      toast.error(t('flows.noRuby'))
      return
    }
    setSettingUp(true)
    try {
      const result = await window.api.setupFlows(rubyCommand)
      if ('error' in result) toast.error(cliErrorText(t, result))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setSettingUp(false)
    }
    await refresh()
  }

  const newFlow = (): void => {
    void navigate('/overview/tests/new', { state: { kind: 'flow' } })
  }
  const newFlowButton = (
    <Tooltip content={t('tooltips.flows.newFlow')} position="bottom">
      <button className={`${rowButton} h-7`} onClick={newFlow}>
        {t('flows.newFlow')}
      </button>
    </Tooltip>
  )
  const learnMore = <DocsLink id="docs.flows" topic={t('docs.topics.flows')} size="xs" />

  const message = (text: string, extra?: React.ReactNode): JSX.Element => (
    <div
      className="flex flex-col items-center justify-center gap-3 h-full text-neutral-md text-sm p-8 text-center"
      data-testid="flows-message"
    >
      <p className="max-w-md">{text}</p>
      {extra}
    </div>
  )

  const body = (): React.ReactNode => {
    switch (view.state) {
      case 'loading':
        return null
      case 'no-project':
        return null
      case 'error':
        return message(
          view.message,
          <Tooltip content={t('tooltips.flows.retry')} position="bottom">
            <button className={rowButton} onClick={() => void refresh()}>
              {t('flows.retry')}
            </button>
          </Tooltip>
        )
      case 'unsupported':
        return message(
          t(view.reason === 'gem' ? 'flows.unsupportedGem' : 'flows.unsupportedProject')
        )
      case 'needs-setup':
        return message(
          t('flows.setupIntro'),
          <div className="flex items-center gap-3">
            <Tooltip content={t('tooltips.flows.setUp')} position="bottom">
              <button className={rowButton} disabled={settingUp} onClick={() => void setUp()}>
                {settingUp ? t('flows.settingUp') : t('flows.setUp')}
              </button>
            </Tooltip>
            {learnMore}
          </div>
        )
      case 'ready':
        if (view.rows.length === 0)
          return message(
            t('flows.empty'),
            <div className="flex items-center gap-3">
              {newFlowButton}
              {learnMore}
            </div>
          )
        return (
          <div className="flex flex-col h-full min-h-0">
            <div className="flex items-center gap-3 p-3 border-b border-neutral-bdr">
              {newFlowButton}
              <span className="ml-auto">{learnMore}</span>
            </div>
            {view.listError && (
              <p
                role="alert"
                className="px-4 py-2 text-xs text-status-err border-b border-neutral-bdr"
              >
                {t('flows.listFailed', { message: view.listError })}
              </p>
            )}
            <ul className="flex-1 overflow-y-auto divide-y divide-neutral-bdr">
              {view.rows.map((row) => (
                <FlowRow key={row.name} row={row} now={now} onChanged={() => void refresh()} />
              ))}
            </ul>
          </div>
        )
    }
  }

  if (view.state === 'no-project') return null
  return (
    <div
      className="flex flex-1 min-h-[24rem] border border-neutral-bdr rounded-lg shadow-card bg-white overflow-hidden"
      data-testid="flows-pane"
    >
      <div className="flex-1 min-w-0 min-h-0">{body()}</div>
    </div>
  )
}

export default FlowsPane
