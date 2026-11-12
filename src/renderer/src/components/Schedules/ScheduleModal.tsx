import React, { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import Button from '@components/Button'
import Checkbox from '@components/Checkbox'
import DocsLink from '@components/DocsLink'
import InputField from '@components/InputField'
import Tooltip from '@components/Tooltip'
import useRubyStore from '@foundation/Stores/rubyStore'
import {
  SCHEDULE_AT,
  isScheduleName,
  isScheduleTag,
  validateSchedule,
  validateScheduleRequest
} from '@shared/schedules'
import type {
  GemCliError,
  GemScheduleRule,
  ScheduleChangeResult,
  ScheduleDay,
  ScheduleEvery,
  ScheduleRequest,
  ScheduleSelection,
  ScheduleSettings
} from '@shared/types/schedules'
import ScheduleDialogShell from './ScheduleDialogShell'
import { scheduleErrorText, selectionReady, suggestName } from './scheduleText'

type RunKind = ScheduleSelection['kind']

interface ScheduleModalProps {
  /** The schedule being edited (its values fill the form; saving replaces it), or null */
  editing: GemScheduleRule | null
  /** The files the "Ticked tests" choice runs: the ticked ones, or the edited schedule's */
  files: string[]
  /** How many of the edited schedule's files were left out because they are gone */
  dropped?: number
  /** Which Run choice starts selected when not editing */
  initialKind?: RunKind
  /** The project's tags, offered for "Tests tagged" */
  tags: string[]
  /** Every schedule name in the project, for suggestions and the "already exists" hint */
  takenNames: string[]
  /** process.platform in main; Show the browser is hidden on Linux */
  platform: string
  onClose: () => void
  /** After the gem accepted the schedule: each call's result, for its notice */
  onSaved: (results: ScheduleChangeResult[]) => void
  save: (
    rubyCommand: string,
    request: ScheduleRequest
  ) => Promise<ScheduleChangeResult | GemCliError>
  remove: (rubyCommand: string, name: string) => Promise<ScheduleChangeResult | GemCliError>
}

const EVERY: ScheduleEvery[] = ['hour', 'day', 'weekday', 'week']
const DAYS: ScheduleDay[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
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
  every: ScheduleEvery
  time: string
  day: ScheduleDay
  retries: number
  notify: boolean
}): ScheduleSettings {
  return {
    every: form.every,
    // The gem's hour rule is a minute; the shared check wants a whole time, so 00:MM
    at: form.every === 'hour' ? `00:${form.time}` : form.time,
    ...(form.every === 'week' ? { on: form.day } : {}),
    retries: form.retries,
    notify: form.notify
  }
}

const startKind = (editing: GemScheduleRule | null, initial: RunKind, files: string[]): RunKind => {
  const kind = editing ? editing.selection.kind : initial
  // Nothing left to run as files (all gone): start from All tests instead
  return kind === 'files' && files.length === 0 ? 'all' : kind
}

/** Schedule…: what runs, when, and how; sent to the gem's schedule command. */
const ScheduleModal: React.FC<ScheduleModalProps> = ({
  editing,
  files,
  dropped = 0,
  initialKind = 'all',
  tags,
  takenNames,
  platform,
  onClose,
  onSaved,
  save,
  remove
}) => {
  const { t } = useTranslation()
  const tagListId = useId()
  const [kind, setKind] = useState<RunKind>(() => startKind(editing, initialKind, files))
  const [tag, setTag] = useState(editing?.selection.kind === 'tag' ? editing.selection.tag : '')
  // A suggested name follows the Run choice until the user types one; an edit keeps its own
  const [typedName, setTypedName] = useState<string | null>(editing?.name ?? null)
  const [every, setEvery] = useState<ScheduleEvery>(editing?.every ?? 'weekday')
  const [time, setTime] = useState(editing && editing.every !== 'hour' ? editing.at : '08:00')
  const [minute, setMinute] = useState(editing?.every === 'hour' ? editing.at.slice(3) : '00')
  const [day, setDay] = useState<ScheduleDay>(editing?.on ?? 'mon')
  const [showBrowser, setShowBrowser] = useState(editing?.showBrowser ?? false)
  const [retries, setRetries] = useState(editing?.retries ?? 0)
  const [notify, setNotify] = useState(editing?.notify ?? true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const linux = platform === 'linux'
  const selection: ScheduleSelection =
    kind === 'tag' ? { kind, tag: tag.trim() } : kind === 'files' ? { kind, files } : { kind }
  const name = typedName ?? suggestName(selection, takenNames)
  const nameError = isScheduleName(name) ? undefined : t('schedules.scheduleModal.nameInvalid')
  const nameTaken = takenNames.includes(name) && name !== editing?.name
  const tagError =
    kind === 'tag' && tag.trim() !== '' && !isScheduleTag(tag.trim())
      ? t('schedules.scheduleModal.tagInvalid')
      : undefined

  const hourly = every === 'hour'
  const timeError = hourly
    ? MINUTE.test(minute)
      ? undefined
      : t('schedules.scheduleModal.minuteInvalid')
    : SCHEDULE_AT.test(time)
      ? undefined
      : t('schedules.scheduleModal.timeInvalid')
  const valid = !timeError && !nameError && selectionReady(selection)

  const submit = async (): Promise<void> => {
    if (!valid || saving) return
    setError(null)
    let request: ScheduleRequest
    try {
      request = validateScheduleRequest({
        name,
        ...validateSchedule(
          buildSchedule({ every, time: hourly ? minute : time, day, retries, notify })
        ),
        showBrowser: linux ? false : showBrowser,
        selection
      })
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
      const added = await save(rubyCommand, request)
      if ('error' in added) {
        setError(scheduleErrorText(t, added))
        return
      }
      const results = [added]
      // Renamed: the new one is in; the old one goes (if that fails, both stay and we say why)
      if (editing && editing.name !== request.name) {
        const removed = await remove(rubyCommand, editing.name)
        if ('error' in removed) toast.error(scheduleErrorText(t, removed))
        else results.push(removed)
      }
      toast.success(
        editing
          ? t('schedules.scheduleModal.saved', { name: request.name })
          : t('schedules.scheduleModal.scheduled', { name: request.name })
      )
      onSaved(results)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const radio = (value: RunKind, label: string, disabled = false): React.ReactNode => (
    <label
      className={`flex items-center gap-2 text-sm ${disabled ? 'text-neutral-md' : 'text-neutral-dk'}`}
    >
      <input
        type="radio"
        name="schedule-run"
        value={value}
        checked={kind === value}
        disabled={disabled}
        onChange={() => setKind(value)}
      />
      {label}
    </label>
  )

  return (
    <ScheduleDialogShell
      title={
        editing
          ? t('schedules.scheduleModal.editTitle', { name: editing.name })
          : t('schedules.scheduleModal.title')
      }
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
              {editing ? t('schedules.scheduleModal.saveEdit') : t('schedules.scheduleModal.save')}
            </Button>
          </Tooltip>
        </>
      }
    >
      {dropped > 0 && (
        <p role="status" className="text-sm text-amber-800" data-testid="schedule-files-dropped">
          {t('schedules.scheduleModal.filesDropped', { count: dropped })}
        </p>
      )}
      <InputField
        label={t('schedules.scheduleModal.nameLabel')}
        value={name}
        onChange={(e) => setTypedName(e.target.value)}
        hint={
          nameTaken
            ? t('schedules.scheduleModal.nameTaken', { name })
            : t('schedules.scheduleModal.nameHint')
        }
        error={nameError}
        tooltip={t('tooltips.schedules.name')}
      />
      <fieldset>
        <legend className={labelClass}>{t('schedules.scheduleModal.runLabel')}</legend>
        <Tooltip content={t('tooltips.schedules.run')} position="bottom" className="w-full">
          <div className="space-y-1">
            {radio('all', t('schedules.scheduleModal.runAll'))}
            {radio('tag', t('schedules.scheduleModal.runTag'))}
            {radio(
              'files',
              t('schedules.scheduleModal.runTicked', { count: files.length }),
              files.length === 0
            )}
          </div>
        </Tooltip>
        {kind === 'tag' && (
          <div className="mt-2 pl-6">
            <label htmlFor={`${tagListId}-input`} className={labelClass}>
              {t('schedules.scheduleModal.tagLabel')}
            </label>
            <Tooltip content={t('tooltips.schedules.tag')} position="bottom" className="w-full">
              <input
                id={`${tagListId}-input`}
                type="text"
                list={tagListId}
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                placeholder={t('schedules.scheduleModal.tagPlaceholder')}
                spellCheck={false}
                aria-invalid={tagError ? true : undefined}
                className={`block w-full px-3 py-1 border rounded text-sm ${tagError ? 'border-status-err' : 'border-neutral-bdr'}`}
              />
            </Tooltip>
            <datalist id={tagListId} data-testid="schedule-tag-options">
              {tags.map((tg) => (
                <option key={tg} value={tg} />
              ))}
            </datalist>
            {tagError && (
              <p role="alert" className="text-xs text-status-err mt-1">
                {tagError}
              </p>
            )}
          </div>
        )}
        {kind === 'files' && files.length > 0 && (
          <ul
            className="mt-2 pl-6 max-h-28 overflow-y-auto text-xs text-neutral-dk font-mono"
            data-testid="schedule-files"
          >
            {files.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        )}
      </fieldset>
      <Select
        label={t('schedules.scheduleModal.everyLabel')}
        tooltip={t('tooltips.schedules.every')}
        value={every}
        options={EVERY.map((e) => ({ value: e, text: t(`schedules.scheduleModal.every.${e}`) }))}
        onChange={(v) => setEvery(v as ScheduleEvery)}
      />
      {every === 'week' && (
        <Select
          label={t('schedules.scheduleModal.dayLabel')}
          tooltip={t('tooltips.schedules.day')}
          value={day}
          options={DAYS.map((d) => ({ value: d, text: t(`schedules.days.${d}`) }))}
          onChange={(v) => setDay(v as ScheduleDay)}
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
      {!linux && (
        <div data-testid="schedule-show-browser">
          <Checkbox
            label={t('schedules.scheduleModal.showBrowser')}
            checked={showBrowser}
            onChange={setShowBrowser}
            helpText={t('schedules.scheduleModal.showBrowserHint')}
            tooltip={t('tooltips.schedules.showBrowser')}
          />
          <Tooltip
            content={t('docs.learnMoreAbout', { topic: t('docs.topics.showBrowser') })}
            position="bottom"
          >
            <DocsLink
              id="docs.scheduling.browser"
              topic={t('docs.topics.showBrowser')}
              size="xs"
              className="ml-6"
            />
          </Tooltip>
        </div>
      )}
      <div>
        <Select
          label={t('schedules.scheduleModal.retriesLabel')}
          tooltip={t('tooltips.schedules.retries')}
          value={String(retries)}
          options={[0, 1, 2, 3].map((n) => ({ value: String(n), text: String(n) }))}
          onChange={(v) => setRetries(Number(v))}
        />
        <p className="text-xs text-neutral-md mt-1">{t('schedules.scheduleModal.retriesHint')}</p>
      </div>
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
