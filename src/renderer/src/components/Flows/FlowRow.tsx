import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import toast from 'react-hot-toast'
import Tooltip from '@components/Tooltip'
import useRubyStore from '@foundation/Stores/rubyStore'
import { useRunStore } from '@foundation/Stores/runStore'
import { toRouteParam } from '@foundation/testKey'
import RunFlowModal from './RunFlowModal'
import ScheduleModal from '../Schedules/ScheduleModal'
import FlowSecretsModal from './FlowSecretsModal'
import {
  cliErrorText,
  flowGoneFromOs,
  lastResultText,
  nextRunText,
  scheduleText,
  type FlowRowData
} from '../Schedules/scheduleText'

interface FlowRowProps {
  row: FlowRowData
  /** The time the row's dates are told against ("today", "yesterday") */
  now: Date
  /** After an action that changes what the tab shows */
  onChanged: () => void
}

export const rowButton =
  'text-xs px-2.5 py-1 rounded border border-neutral-bdr text-neutral-dk bg-white hover:bg-neutral-50 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white'

const menuItem =
  'block w-full text-left px-3 py-1.5 text-xs text-neutral-dk hover:bg-neutral-50 disabled:text-neutral-mid disabled:cursor-not-allowed disabled:hover:bg-white'

/** One flow: its last result, its schedule, and Run, Schedule and the More menu. */
const FlowRow: React.FC<FlowRowProps> = ({ row, now, onChanged }) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const runActive = useRunStore((s) => s.isActive)
  const [dialog, setDialog] = useState<'run' | 'schedule' | 'secrets' | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [stopping, setStopping] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const close = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return (): void => document.removeEventListener('mousedown', close)
  }, [menuOpen])

  const { last, schedule } = row
  // An orphan (the OS runs it, schedules.yml lost it) has no rule: its warning and Stop only
  const rule = schedule && !schedule.orphan ? schedule : null
  const osProblem = schedule && schedule.osState !== 'ok' ? schedule.osState : null
  const nextRun = rule ? nextRunText(t, rule.nextRunAt) : null
  const resultsDir = last?.resultsDir

  // Always through the Run modal, so "Show the browser" is there for a flow without inputs too
  const run = (): void => {
    if (runActive) return
    setDialog('run')
  }

  const stopSchedule = async (): Promise<void> => {
    const rubyCommand = useRubyStore.getState().rubyCommand
    if (!rubyCommand) {
      toast.error(t('flows.noRuby'))
      return
    }
    setStopping(true)
    try {
      const result = await window.api.unscheduleFlow(rubyCommand, row.name)
      if ('error' in result) toast.error(cliErrorText(t, result))
      else toast.success(t('flows.stopped', { name: row.title }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setStopping(false)
      onChanged()
    }
  }

  const openResults = async (): Promise<void> => {
    if (!resultsDir) return
    try {
      const result = await window.api.openFlowResults(row.name, resultsDir)
      if (!result.success) toast.error(t('flows.resultsFailed'))
    } catch {
      toast.error(t('flows.resultsFailed'))
    }
  }

  const stopButton = (
    <Tooltip content={t('tooltips.flows.stopSchedule')} position="bottom">
      <button className={rowButton} disabled={stopping} onClick={() => void stopSchedule()}>
        {t('flows.stopSchedule')}
      </button>
    </Tooltip>
  )

  return (
    <li className="flex items-start gap-4 py-3 px-4" data-testid={`flow-row-${row.name}`}>
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-neutral-dark truncate">{row.title}</span>
          {row.title !== row.name && (
            <span className="text-xs font-mono text-neutral-md truncate">{row.name}</span>
          )}
          {row.missing && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-status-err-bg text-red-600 font-medium whitespace-nowrap">
              {t('flows.fileMissing')}
            </span>
          )}
        </div>
        <p className="text-xs text-neutral-dk flex items-center gap-2" data-testid="flow-last">
          <span
            className={
              last?.status === 'failed' || last?.status === 'setup_error' ? 'text-status-err' : ''
            }
          >
            {lastResultText(t, last, now)}
          </span>
          {resultsDir && (
            <Tooltip content={t('tooltips.flows.viewResults')} position="bottom">
              <button className="text-ruby hover:underline" onClick={() => void openResults()}>
                {t('flows.viewResults')}
              </button>
            </Tooltip>
          )}
        </p>
        {rule && (
          <p className="text-xs text-neutral-dk" data-testid="flow-schedule">
            {scheduleText(t, rule)}
            {nextRun && <span className="text-neutral-md"> · {nextRun}</span>}
          </p>
        )}
        {osProblem && (
          <p
            className="text-xs text-status-err flex items-center gap-2"
            data-testid="flow-os-state"
          >
            <span>{t('flows.osProblem', { state: osProblem })}</span>
            {rule && !flowGoneFromOs(osProblem) && !row.missing && (
              <Tooltip content={t('tooltips.flows.reschedule')} position="bottom">
                <button className={rowButton} onClick={() => setDialog('schedule')}>
                  {t('flows.reschedule')}
                </button>
              </Tooltip>
            )}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {!row.missing && (
          <Tooltip
            content={t('tooltips.flows.runWithInputs')}
            disabledReason={runActive ? t('tooltips.flows.runBusy') : undefined}
            position="bottom"
          >
            <button className={rowButton} disabled={runActive} onClick={run}>
              {t('flows.runWithInputs')}
            </button>
          </Tooltip>
        )}
        {schedule
          ? stopButton
          : !row.missing && (
              <Tooltip content={t('tooltips.flows.schedule')} position="bottom">
                <button className={rowButton} onClick={() => setDialog('schedule')}>
                  {t('flows.schedule')}
                </button>
              </Tooltip>
            )}
        <div className="relative" ref={menuRef}>
          <Tooltip content={t('tooltips.flows.more')} position="bottom">
            <button
              className={rowButton}
              aria-label={t('flows.moreLabel', { name: row.title })}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(!menuOpen)}
            >
              ⋯
            </button>
          </Tooltip>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full mt-1 z-20 w-40 rounded border border-neutral-bdr bg-white shadow-card py-1"
            >
              {row.testId && !row.missing && (
                <button
                  role="menuitem"
                  className={menuItem}
                  title={t('tooltips.flows.edit')}
                  onClick={() => {
                    setMenuOpen(false)
                    void navigate(`/overview/tests/${toRouteParam(`id:${row.testId}`)}`)
                  }}
                >
                  {t('flows.edit')}
                </button>
              )}
              <button
                role="menuitem"
                className={menuItem}
                title={t('tooltips.flows.secrets')}
                onClick={() => {
                  setMenuOpen(false)
                  setDialog('secrets')
                }}
              >
                {t('flows.secretsMenu')}
              </button>
            </div>
          )}
        </div>
      </div>
      {dialog === 'run' && (
        <RunFlowModal
          name={row.name}
          title={row.title}
          inputs={row.inputs}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'schedule' && (
        <ScheduleModal
          name={row.name}
          title={row.title}
          inputs={row.inputs}
          schedule={rule}
          onClose={() => setDialog(null)}
          onScheduled={onChanged}
        />
      )}
      {dialog === 'secrets' && <FlowSecretsModal onClose={() => setDialog(null)} />}
    </li>
  )
}

export default FlowRow
