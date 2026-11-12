import React, { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import ContextMenu from '@components/ContextMenu'
import Tooltip from '@components/Tooltip'
import type { GemSchedule } from '@shared/types/schedules'
import { lastResultText, missingFileOf, nextRunText, runsText, scheduleText } from './scheduleText'

interface ScheduleRowProps {
  schedule: GemSchedule
  now: Date
  /** A test run is going: Run now waits for it */
  runActive: boolean
  onViewReport: () => void
  onRunNow: () => void
  onEdit: () => void
  onStop: () => void
  onReschedule: () => void
}

const actionClass =
  'text-xs px-2.5 py-1 rounded border border-neutral-bdr font-medium text-neutral-dk bg-white hover:bg-neutral-50 disabled:text-neutral-md disabled:cursor-not-allowed'

/** One schedule: name, what and when it runs, its last result, and its actions. */
const ScheduleRow: React.FC<ScheduleRowProps> = ({
  schedule,
  now,
  runActive,
  onViewReport,
  onRunNow,
  onEdit,
  onStop,
  onReschedule
}) => {
  const { t } = useTranslation()
  const moreRef = useRef<HTMLButtonElement>(null)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const rule = schedule.orphan ? null : schedule
  const missing = missingFileOf(schedule.osState)

  const meta = rule
    ? [
        runsText(t, rule.selection),
        scheduleText(t, rule),
        rule.showBrowser ? t('schedules.row.browserShown') : null,
        nextRunText(t, rule.nextRunAt)
      ].filter(Boolean)
    : []

  const last = schedule.last
  const lastClass =
    last?.status === 'passed'
      ? 'text-status-ok'
      : last?.status === 'failed' || last?.status === 'setup_error'
        ? 'text-status-err'
        : 'text-neutral-md'

  const openMenu = (): void => {
    const rect = moreRef.current?.getBoundingClientRect()
    setMenu({ x: rect?.left ?? 0, y: rect?.bottom ?? 0 })
  }

  return (
    <li
      className="py-2 border-t border-dashed border-neutral-bdr first:border-t-0"
      data-testid={`schedule-row-${schedule.name}`}
    >
      <div className="flex items-start gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="text-sm">
            <span className="font-semibold text-neutral-dark mr-3">{schedule.name}</span>
            <span className="text-neutral-md">{meta.join(' · ')}</span>
          </div>
          <div className="text-xs text-neutral-md mt-0.5">
            <span className={lastClass}>{lastResultText(t, last, now)}</span>
            {rule?.notify && <span> · {t('schedules.row.notifyOn')}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Tooltip content={t('tooltips.schedules.viewReport')} position="top">
            <button type="button" className={actionClass} onClick={onViewReport}>
              {t('schedules.row.viewReport')}
            </button>
          </Tooltip>
          {rule && (
            <Tooltip
              content={t('tooltips.schedules.runNow')}
              disabledReason={runActive ? t('run.busy') : undefined}
              position="top"
            >
              <button type="button" className={actionClass} onClick={onRunNow} disabled={runActive}>
                {t('schedules.row.runNow')}
              </button>
            </Tooltip>
          )}
          <Tooltip content={t('tooltips.schedules.more')} position="top">
            <button
              ref={moreRef}
              type="button"
              className={actionClass}
              aria-label={t('schedules.row.more', { name: schedule.name })}
              aria-haspopup="menu"
              aria-expanded={menu !== null}
              onClick={openMenu}
            >
              ⋯
            </button>
          </Tooltip>
        </div>
      </div>
      {schedule.osState !== 'ok' && (
        <div
          role="status"
          className="mt-1 flex items-center gap-2 text-xs rounded px-2 py-1 bg-amber-50 text-amber-800"
        >
          <span className="min-w-0 break-words">
            {missing !== null
              ? t('schedules.row.fileNotFound', { file: missing })
              : t('schedules.row.osState', { state: schedule.osState })}
          </span>
          {rule && missing !== null && (
            <Tooltip content={t('tooltips.schedules.edit')} position="top">
              <button type="button" className={actionClass} onClick={onEdit}>
                {t('schedules.row.edit')}
              </button>
            </Tooltip>
          )}
          {rule && missing === null && (
            <Tooltip content={t('tooltips.schedules.reschedule')} position="top">
              <button type="button" className={actionClass} onClick={onReschedule}>
                {t('schedules.row.reschedule')}
              </button>
            </Tooltip>
          )}
        </div>
      )}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            ...(rule
              ? [
                  {
                    label: t('schedules.row.edit'),
                    tooltip: t('tooltips.schedules.edit'),
                    onClick: onEdit
                  }
                ]
              : []),
            {
              label: t('schedules.row.stop'),
              tooltip: t('tooltips.schedules.stop'),
              onClick: onStop
            }
          ]}
        />
      )}
    </li>
  )
}

export default ScheduleRow
