import React, { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import Button from '@components/Button'
import Checkbox from '@components/Checkbox'
import InputField from '@components/InputField'
import Tooltip from '@components/Tooltip'
import useRubyStore from '@foundation/Stores/rubyStore'
import { FLOW_AT, validateSchedule } from '@shared/schedules'
import type { FlowDay, FlowEvery, FlowSchedule, GemScheduleRule } from '@shared/types/schedules'
import ScheduleDialogShell from './ScheduleDialogShell'
import { cliErrorText } from './scheduleText'

interface ScheduleModalProps {
  name: string
  title: string
  /** The current schedule when re-scheduling; its values fill the form */
  schedule: GemScheduleRule | null
  onClose: () => void
  /** After the gem accepted the schedule */
  onScheduled: () => void
}

const EVERY: FlowEvery[] = ['hour', 'day', 'weekday', 'week']
const DAYS: FlowDay[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const MINUTE = /^[0-5]\d$/

const selectClass =
  'block w-full pl-3 pr-8 py-1 border border-neutral-bdr rounded bg-white text-sm text-neutral-dk focus:ring-ruby focus:border-ruby transition-colors'
const labelClass = 'block text-xs font-semibold uppercase tracking-wider text-neutral-dk mb-1'

interface SelectProps {
  label: string
  tooltip: string
  value: string
  options: { value: string; text: string }[]
  onChange: (value: string) => void
}

const Select: React.FC<SelectProps> = ({ label, tooltip, value, options, onChange }) => {
  const id = useId()
  return (
    <div className="w-full">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <Tooltip content={tooltip} position="bottom" className="w-full">
        <select
          id={id}
          className={selectClass}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.text}
            </option>
          ))}
        </select>
      </Tooltip>
    </div>
  )
}

/** The schedule the form describes; `time` is HH:MM, or MM for an hourly one. */
export function buildSchedule(form: {
  every: FlowEvery
  time: string
  day: FlowDay
  retries: number
  notify: boolean
}): FlowSchedule {
  return {
    every: form.every,
    // The gem's hour rule is a minute; the shared check wants a whole time, so 00:MM
    at: form.every === 'hour' ? `00:${form.time}` : form.time,
    ...(form.every === 'week' ? { on: form.day } : {}),
    retries: form.retries,
    notify: form.notify
  }
}

/** Schedule…: how often, when, retries and notify, sent to the gem's schedule command. */
const ScheduleModal: React.FC<ScheduleModalProps> = ({
  name,
  title,
  schedule,
  onClose,
  onScheduled
}) => {
  const { t } = useTranslation()
  const [every, setEvery] = useState<FlowEvery>(schedule?.every ?? 'weekday')
  const [time, setTime] = useState(schedule && schedule.every !== 'hour' ? schedule.at : '08:00')
  const [minute, setMinute] = useState(schedule?.every === 'hour' ? schedule.at.slice(3) : '00')
  const [day, setDay] = useState<FlowDay>(schedule?.on ?? 'mon')
  const [retries, setRetries] = useState(schedule?.retries ?? 0)
  const [notify, setNotify] = useState(schedule?.notify ?? true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const hourly = every === 'hour'
  const timeError = hourly
    ? MINUTE.test(minute)
      ? undefined
      : t('schedules.scheduleModal.minuteInvalid')
    : FLOW_AT.test(time)
      ? undefined
      : t('schedules.scheduleModal.timeInvalid')
  const valid = !timeError

  const submit = async (): Promise<void> => {
    if (!valid || saving) return
    setError(null)
    let request: FlowSchedule
    try {
      request = validateSchedule(
        buildSchedule({
          every,
          time: hourly ? minute : time,
          day,
          retries,
          notify
        })
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return
    }
    const rubyCommand = useRubyStore.getState().rubyCommand
    if (!rubyCommand) {
      setError(t('schedules.noRuby'))
      return
    }
    setSaving(true)
    try {
      const result = await window.api.scheduleFlow(rubyCommand, name, request)
      if ('error' in result) {
        setError(cliErrorText(t, result))
        return
      }
      toast.success(result.message || t('schedules.scheduleModal.scheduled', { name: title }))
      onScheduled()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <ScheduleDialogShell
      title={t('schedules.scheduleModal.title', { name: title })}
      onClose={onClose}
      footer={
        <>
          <Tooltip content={t('tooltips.schedules.cancel')} position="top">
            <Button type="secondary" onClick={onClose}>
              {t('schedules.cancel')}
            </Button>
          </Tooltip>
          <Tooltip
            content={t('tooltips.schedules.scheduleSave')}
            disabledReason={valid ? undefined : t('tooltips.schedules.fixSchedule')}
            position="top"
          >
            <Button type="primary" onClick={() => void submit()} disabled={!valid || saving}>
              {t('schedules.scheduleModal.save')}
            </Button>
          </Tooltip>
        </>
      }
    >
      <Select
        label={t('schedules.scheduleModal.everyLabel')}
        tooltip={t('tooltips.schedules.every')}
        value={every}
        options={EVERY.map((e) => ({ value: e, text: t(`schedules.scheduleModal.every.${e}`) }))}
        onChange={(v) => setEvery(v as FlowEvery)}
      />
      {every === 'week' && (
        <Select
          label={t('schedules.scheduleModal.dayLabel')}
          tooltip={t('tooltips.schedules.day')}
          value={day}
          options={DAYS.map((d) => ({ value: d, text: t(`schedules.days.${d}`) }))}
          onChange={(v) => setDay(v as FlowDay)}
        />
      )}
      {hourly ? (
        <InputField
          label={t('schedules.scheduleModal.minuteLabel')}
          value={minute}
          onChange={(e) => setMinute(e.target.value)}
          hint={t('schedules.scheduleModal.minuteHint')}
          error={timeError}
          tooltip={t('tooltips.schedules.minute')}
        />
      ) : (
        <InputField
          label={t('schedules.scheduleModal.timeLabel')}
          value={time}
          onChange={(e) => setTime(e.target.value)}
          hint={t('schedules.scheduleModal.timeHint')}
          error={timeError}
          tooltip={t('tooltips.schedules.time')}
        />
      )}
      <Select
        label={t('schedules.scheduleModal.retriesLabel')}
        tooltip={t('tooltips.schedules.retries')}
        value={String(retries)}
        options={[0, 1, 2, 3].map((n) => ({ value: String(n), text: String(n) }))}
        onChange={(v) => setRetries(Number(v))}
      />
      <Checkbox
        label={t('schedules.scheduleModal.notify')}
        checked={notify}
        onChange={setNotify}
        tooltip={t('tooltips.schedules.notify')}
      />
      {error && (
        <p role="alert" className="text-sm text-status-err" data-testid="schedule-error">
          {error}
        </p>
      )}
    </ScheduleDialogShell>
  )
}

export default ScheduleModal
