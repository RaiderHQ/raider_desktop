import React, { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import Button from '@components/Button'
import Checkbox from '@components/Checkbox'
import DocsLink from '@components/DocsLink'
import InputField from '@components/InputField'
import Tooltip from '@components/Tooltip'
import useRubyStore from '@foundation/Stores/rubyStore'
import { FLOW_AT, validateSchedule } from '@shared/schedules'
import type { FlowDay, FlowEvery, FlowSchedule, GemScheduleRule } from '@shared/types/schedules'
import type { FlowInput } from '@shared/types/projectTest'
import FlowModal from '../Flows/FlowModal'
import { cliErrorText, inputErrors } from './scheduleText'

interface ScheduleModalProps {
  name: string
  title: string
  inputs: FlowInput[]
  /** The flow's current schedule when re-scheduling; its values fill the form */
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
  inputs: Record<string, string>
}): FlowSchedule {
  return {
    every: form.every,
    // The gem's hour rule is a minute; the shared check wants a whole time, so 00:MM
    at: form.every === 'hour' ? `00:${form.time}` : form.time,
    ...(form.every === 'week' ? { on: form.day } : {}),
    retries: form.retries,
    notify: form.notify,
    inputs: form.inputs
  }
}

/** Schedule…: how often, when, retries, notify and the inputs, sent to `raider flow schedule`. */
const ScheduleModal: React.FC<ScheduleModalProps> = ({
  name,
  title,
  inputs,
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
  const [values, setValues] = useState<Record<string, string>>(() => ({
    ...Object.fromEntries(inputs.map((i) => [i.name, i.default])),
    ...(schedule?.inputs ?? {})
  }))
  // A schedule may hold an input the recording no longer has; it is shown so it can be changed
  const fields = [...new Set([...inputs.map((i) => i.name), ...Object.keys(values)])]
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const hourly = every === 'hour'
  const timeError = hourly
    ? MINUTE.test(minute)
      ? undefined
      : t('flows.scheduleModal.minuteInvalid')
    : FLOW_AT.test(time)
      ? undefined
      : t('flows.scheduleModal.timeInvalid')
  const errors = inputErrors(values)
  const valid = !timeError && Object.keys(errors).length === 0

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
          notify,
          inputs: values
        })
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return
    }
    const rubyCommand = useRubyStore.getState().rubyCommand
    if (!rubyCommand) {
      setError(t('flows.noRuby'))
      return
    }
    setSaving(true)
    try {
      const result = await window.api.scheduleFlow(rubyCommand, name, request)
      if ('error' in result) {
        setError(cliErrorText(t, result))
        return
      }
      toast.success(result.message || t('flows.scheduleModal.scheduled', { name: title }))
      onScheduled()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <FlowModal
      title={t('flows.scheduleModal.title', { name: title })}
      onClose={onClose}
      footer={
        <>
          <DocsLink id="docs.schedules" topic={t('docs.topics.schedules')} className="mr-auto" />
          <Tooltip content={t('tooltips.flows.cancel')} position="top">
            <Button type="secondary" onClick={onClose}>
              {t('flows.cancel')}
            </Button>
          </Tooltip>
          <Tooltip
            content={t('tooltips.flows.scheduleSave')}
            disabledReason={valid ? undefined : t('tooltips.flows.fixSchedule')}
            position="top"
          >
            <Button type="primary" onClick={() => void submit()} disabled={!valid || saving}>
              {t('flows.scheduleModal.save')}
            </Button>
          </Tooltip>
        </>
      }
    >
      <Select
        label={t('flows.scheduleModal.everyLabel')}
        tooltip={t('tooltips.flows.every')}
        value={every}
        options={EVERY.map((e) => ({ value: e, text: t(`flows.scheduleModal.every.${e}`) }))}
        onChange={(v) => setEvery(v as FlowEvery)}
      />
      {every === 'week' && (
        <Select
          label={t('flows.scheduleModal.dayLabel')}
          tooltip={t('tooltips.flows.day')}
          value={day}
          options={DAYS.map((d) => ({ value: d, text: t(`flows.days.${d}`) }))}
          onChange={(v) => setDay(v as FlowDay)}
        />
      )}
      {hourly ? (
        <InputField
          label={t('flows.scheduleModal.minuteLabel')}
          value={minute}
          onChange={(e) => setMinute(e.target.value)}
          hint={t('flows.scheduleModal.minuteHint')}
          error={timeError}
          tooltip={t('tooltips.flows.minute')}
        />
      ) : (
        <InputField
          label={t('flows.scheduleModal.timeLabel')}
          value={time}
          onChange={(e) => setTime(e.target.value)}
          hint={t('flows.scheduleModal.timeHint')}
          error={timeError}
          tooltip={t('tooltips.flows.time')}
        />
      )}
      <Select
        label={t('flows.scheduleModal.retriesLabel')}
        tooltip={t('tooltips.flows.retries')}
        value={String(retries)}
        options={[0, 1, 2, 3].map((n) => ({ value: String(n), text: String(n) }))}
        onChange={(v) => setRetries(Number(v))}
      />
      <Checkbox
        label={t('flows.scheduleModal.notify')}
        checked={notify}
        onChange={setNotify}
        tooltip={t('tooltips.flows.notify')}
      />
      {fields.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-neutral-dk">{t('flows.scheduleModal.inputsHint')}</p>
          {fields.map((field) => (
            <InputField
              key={field}
              label={field}
              value={values[field] ?? ''}
              onChange={(e) => setValues({ ...values, [field]: e.target.value })}
              error={errors[field]}
              tooltip={t('tooltips.flows.inputValue')}
            />
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-status-err" data-testid="schedule-error">
          {error}
        </p>
      )}
    </FlowModal>
  )
}

export default ScheduleModal
