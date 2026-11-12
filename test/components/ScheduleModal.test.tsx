import { render, screen, fireEvent, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import toast from 'react-hot-toast'
import en from '../../src/renderer/src/assets/translations/en.json'
import ScheduleModal, { buildSchedule } from '@components/Schedules/ScheduleModal'
import {
  lastResultText,
  nextRunText,
  requestFromRule,
  runsText,
  scheduleErrorText,
  scheduleText,
  soonestNextRun,
  suggestName
} from '@components/Schedules/scheduleText'
import useRubyStore from '@foundation/Stores/rubyStore'
import { validateSchedule, validateScheduleRequest } from '@shared/schedules'
import type { ScheduledLastRun, GemScheduleRule } from '@shared/types/schedules'

/** en.json with {{placeholders}} filled, so the tests read the real copy */
const lookup = (key: string): unknown =>
  key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], en)
const t = (key: string, options: Record<string, unknown> = {}): string => {
  const plural =
    typeof options.count === 'number'
      ? lookup(`${key}_${options.count === 1 ? 'one' : 'other'}`)
      : undefined
  const text = plural ?? lookup(key)
  if (typeof text !== 'string') return key
  return text.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(options[name] ?? ''))
}

// rubyStore loads versionStore, whose timer polls window.api; without a stub it can outlive the
// test environment and fail the run with "window is not defined"
;(window as unknown as { api: object }).api = {}

vi.mock('react-i18next', () => ({ useTranslation: (): { t: typeof t } => ({ t }) }))
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }))

/** A local time today (or `daysAgo` before), so the text doesn't depend on the time zone */
const at = (hours: number, minutes: number, daysAgo = 0): string => {
  const d = new Date(2026, 10, 10, hours, minutes)
  d.setDate(d.getDate() - daysAgo)
  return d.toISOString()
}
const now = new Date(2026, 10, 10, 12, 0)

const last = (patch: Partial<ScheduledLastRun> = {}): ScheduledLastRun => ({
  status: 'passed',
  finishedAt: at(8, 0),
  trigger: 'schedule',
  counts: { total: 5, passed: 4, failed: 1, skipped: 0 },
  ...patch
})

const schedule = (patch: Partial<GemScheduleRule> = {}): GemScheduleRule => ({
  name: 'fill_hours',
  every: 'weekday',
  at: '08:00',
  on: null,
  retries: 0,
  notify: false,
  showBrowser: false,
  selection: { kind: 'all' },
  nextRunAt: null,
  osState: 'ok',
  last: null,
  ...patch
})

// What the modal is given to send a schedule with: it never reaches window.api itself
const api = {
  save: vi.fn(),
  remove: vi.fn()
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.values(api).forEach((f) => f.mockReset())
  useRubyStore.setState({ rubyCommand: 'ruby' })
})

describe('schedule texts', () => {
  it('words the last result', () => {
    expect(lastResultText(t, null, now)).toBe('Not run yet')
    expect(lastResultText(t, last({ status: 'setup_error' }), now)).toBe(
      'Could not start · 08:00 today'
    )
    expect(lastResultText(t, last({ status: 'busy' }), now)).toBe(
      'Skipped, another run was going · 08:00 today'
    )
    expect(lastResultText(t, last(), now)).toBe('Passed 4 · 08:00 today')
    expect(lastResultText(t, last({ status: 'failed' }), now)).toBe('Failed 1 of 5 · 08:00 today')
    expect(lastResultText(t, last({ status: 'setup_error', finishedAt: at(8, 0, 1) }), now)).toBe(
      'Could not start · 08:00 yesterday'
    )
  })

  it('words each schedule preset', () => {
    expect(scheduleText(t, schedule({ every: 'weekday' }))).toBe('Every weekday at 08:00')
    expect(scheduleText(t, schedule({ every: 'hour', at: '00:15' }))).toBe('Every hour at :15')
    expect(scheduleText(t, schedule({ every: 'day' }))).toBe('Every day at 08:00')
    expect(scheduleText(t, schedule({ every: 'week', on: 'mon' }))).toBe('Every Monday at 08:00')
    // Notify is its own part of the row now
    expect(scheduleText(t, schedule({ notify: true }))).toBe('Every weekday at 08:00')
  })

  it('words the next run in local time', () => {
    // Tuesday 10 Nov 2026, 08:00 local
    const next = new Date(2026, 10, 10, 8, 0).toISOString()
    expect(nextRunText(t, next)).toBe('Next run Tue 08:00')
    expect(nextRunText(t, null)).toBeNull()
  })
})

describe('ScheduleModal', () => {
  it('builds a valid schedule for each preset', () => {
    const base = { time: '08:00', day: 'tue' as const, retries: 2, notify: true }
    expect(validateSchedule(buildSchedule({ ...base, every: 'hour', time: '15' }))).toEqual({
      every: 'hour',
      at: '00:15',
      retries: 2,
      notify: true
    })
    for (const every of ['day', 'weekday'] as const) {
      expect(validateSchedule(buildSchedule({ ...base, every }))).toEqual(
        expect.objectContaining({ every, at: '08:00' })
      )
      expect(buildSchedule({ ...base, every })).not.toHaveProperty('on')
    }
    expect(validateSchedule(buildSchedule({ ...base, every: 'week' }))).toEqual(
      expect.objectContaining({ every: 'week', at: '08:00', on: 'tue' })
    )
  })

  type Props = React.ComponentProps<typeof ScheduleModal>
  const renderModal = (over: Partial<Props> = {}): Props => {
    const props: Props = {
      editing: null,
      files: [],
      tags: ['smoke', 'checkout'],
      takenNames: [],
      platform: 'darwin',
      onClose: vi.fn(),
      onSaved: vi.fn(),
      save: api.save,
      remove: api.remove,
      ...over
    }
    render(<ScheduleModal {...props} />)
    return props
  }
  const ok = { ok: true, message: 'Scheduled', notice: null }
  const nameField = (): HTMLInputElement => screen.getByLabelText('Name') as HTMLInputElement
  const saveButton = (name = 'Schedule'): HTMLElement => screen.getByRole('button', { name })
  const clickSave = async (name?: string): Promise<void> => {
    await act(async () => {
      fireEvent.click(saveButton(name))
    })
  }
  const sent = (): Record<string, unknown> => api.save.mock.calls[0][1]

  it('sends an hourly schedule of all tests with notify on and the browser hidden', async () => {
    api.save.mockResolvedValue(ok)
    const props = renderModal()
    fireEvent.change(screen.getByLabelText('Repeat'), { target: { value: 'hour' } })
    fireEvent.change(screen.getByLabelText('Minute past the hour'), { target: { value: '15' } })
    await clickSave()
    expect(api.save).toHaveBeenCalledWith('ruby', {
      name: 'all_tests',
      every: 'hour',
      at: '00:15',
      retries: 0,
      notify: true,
      showBrowser: false,
      selection: { kind: 'all' }
    })
    expect(() => validateScheduleRequest(sent())).not.toThrow()
    expect(toast.success).toHaveBeenCalledWith('Scheduled all_tests.')
    expect(props.onSaved).toHaveBeenCalledWith([ok])
    expect(props.onClose).toHaveBeenCalled()
  })

  it('suggests a name from what runs, and a free one when taken', () => {
    renderModal({ files: ['spec/a_spec.rb'], takenNames: ['all_tests', 'tag_smoke'] })
    expect(nameField().value).toBe('all_tests_2')
    fireEvent.click(screen.getByLabelText('Tests tagged'))
    fireEvent.change(screen.getByLabelText('Tag'), { target: { value: 'Smoke' } })
    expect(nameField().value).toBe('tag_smoke_2')
    fireEvent.change(screen.getByLabelText('Tag'), { target: { value: 'api:v2' } })
    expect(nameField().value).toBe('tag_api_v2')
    fireEvent.click(screen.getByLabelText('Ticked test (1)'))
    expect(nameField().value).toBe('selected_tests')
    // Typed once, the name stays
    fireEvent.change(nameField(), { target: { value: 'nightly' } })
    fireEvent.click(screen.getByLabelText('All tests'))
    expect(nameField().value).toBe('nightly')
  })

  it('suggestName keeps within 60 characters, suffix included', () => {
    const tag = 'x'.repeat(100)
    const first = suggestName({ kind: 'tag', tag }, [])
    expect(first).toHaveLength(60)
    const second = suggestName({ kind: 'tag', tag }, [first])
    expect(second).toHaveLength(60)
    expect(second.endsWith('_2')).toBe(true)
  })

  it('says a taken name is replaced, and refuses an invalid one', () => {
    renderModal({ takenNames: ['nightly'] })
    fireEvent.change(nameField(), { target: { value: 'nightly' } })
    expect(
      screen.getByText('A schedule called nightly already exists. Saving replaces it.')
    ).toBeInTheDocument()
    expect(saveButton()).not.toBeDisabled()
    fireEvent.change(nameField(), { target: { value: 'Night Run' } })
    expect(screen.getByText(en.schedules.scheduleModal.nameInvalid)).toBeInTheDocument()
    expect(saveButton()).toBeDisabled()
  })

  it('runs a tag picked from the project tags or typed, checked with the gem rule', async () => {
    api.save.mockResolvedValue(ok)
    renderModal()
    fireEvent.click(screen.getByLabelText('Tests tagged'))
    const options = screen.getByTestId('schedule-tag-options').querySelectorAll('option')
    expect([...options].map((o) => o.getAttribute('value'))).toEqual(['smoke', 'checkout'])
    // Empty tag: nothing to send
    expect(saveButton()).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Tag'), { target: { value: 'has space' } })
    expect(screen.getByText(en.schedules.scheduleModal.tagInvalid)).toBeInTheDocument()
    expect(saveButton()).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Tag'), { target: { value: 'smoke' } })
    await clickSave()
    expect(sent()).toEqual(
      expect.objectContaining({ name: 'tag_smoke', selection: { kind: 'tag', tag: 'smoke' } })
    )
  })

  it('offers the ticked tests, listed, and disables the choice with none ticked', async () => {
    api.save.mockResolvedValue(ok)
    renderModal({ files: ['spec/a_spec.rb', 'spec/b_spec.rb'], initialKind: 'files' })
    expect(screen.getByLabelText('Ticked tests (2)')).toBeChecked()
    expect(screen.getByTestId('schedule-files')).toHaveTextContent('spec/a_spec.rb')
    await clickSave()
    expect(sent()).toEqual(
      expect.objectContaining({
        name: 'selected_tests',
        selection: { kind: 'files', files: ['spec/a_spec.rb', 'spec/b_spec.rb'] }
      })
    )
  })

  it('disables Ticked tests when none are ticked', () => {
    renderModal({ files: [], initialKind: 'files' })
    expect(screen.getByLabelText('Ticked tests (0)')).toBeDisabled()
    expect(screen.getByLabelText('All tests')).toBeChecked()
  })

  it('sends Show the browser and retries; Learn more opens the browser page', async () => {
    api.save.mockResolvedValue(ok)
    const openDocs = vi.fn()
    ;(window as unknown as { api: object }).api = { openDocs }
    renderModal()
    expect(screen.getByLabelText(/^Show the browser/)).not.toBeChecked()
    fireEvent.click(screen.getByLabelText(/^Show the browser/))
    fireEvent.change(screen.getByLabelText('Retry failed tests'), { target: { value: '3' } })
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Learn more about showing the browser on scheduled runs in the documentation'
      })
    )
    expect(openDocs).toHaveBeenCalledWith('docs.scheduling.browser')
    await clickSave()
    expect(sent()).toEqual(expect.objectContaining({ showBrowser: true, retries: 3 }))
    ;(window as unknown as { api: object }).api = {}
  })

  it('hides Show the browser on Linux and never sends it on', async () => {
    api.save.mockResolvedValue(ok)
    renderModal({ platform: 'linux', editing: schedule({ showBrowser: true }) })
    expect(screen.queryByText('Show the browser')).toBeNull()
    expect(screen.queryByTestId('schedule-show-browser')).toBeNull()
    await clickSave('Save')
    expect(sent()).toEqual(expect.objectContaining({ showBrowser: false }))
  })

  it('fills the form from the edited schedule and replaces it on Save', async () => {
    api.save.mockResolvedValue(ok)
    const props = renderModal({
      takenNames: ['fill_hours'],
      editing: schedule({
        every: 'week',
        on: 'fri',
        at: '07:30',
        retries: 2,
        notify: false,
        showBrowser: true,
        selection: { kind: 'tag', tag: 'smoke' }
      })
    })
    expect(screen.getByRole('dialog')).toHaveTextContent('Edit fill_hours')
    expect(nameField().value).toBe('fill_hours')
    // Its own name isn't "taken"
    expect(screen.queryByText(/already exists/)).toBeNull()
    expect(screen.getByLabelText('Tag')).toHaveValue('smoke')
    expect(screen.getByLabelText('Day')).toHaveValue('fri')
    await clickSave('Save')
    expect(api.save).toHaveBeenCalledWith('ruby', {
      name: 'fill_hours',
      every: 'week',
      at: '07:30',
      on: 'fri',
      retries: 2,
      notify: false,
      showBrowser: true,
      selection: { kind: 'tag', tag: 'smoke' }
    })
    expect(api.remove).not.toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalledWith('Saved fill_hours.')
    expect(props.onSaved).toHaveBeenCalledWith([ok])
  })

  it('leaves `on` out when an edited weekly schedule becomes daily', async () => {
    api.save.mockResolvedValue(ok)
    renderModal({ editing: schedule({ every: 'week', on: 'mon' }) })
    fireEvent.change(screen.getByLabelText('Repeat'), { target: { value: 'day' } })
    await clickSave('Save')
    expect(sent()).not.toHaveProperty('on')
    expect(() => validateScheduleRequest(sent())).not.toThrow()
  })

  it('a rename adds the new schedule, then removes the old one', async () => {
    const removed = { ok: true, message: 'Removed', notice: 'Removed old 4.1 ones' }
    api.save.mockResolvedValue(ok)
    api.remove.mockResolvedValue(removed)
    const props = renderModal({ editing: schedule() })
    fireEvent.change(nameField(), { target: { value: 'morning' } })
    await clickSave('Save')
    expect(api.save).toHaveBeenCalledWith('ruby', expect.objectContaining({ name: 'morning' }))
    expect(api.remove).toHaveBeenCalledWith('ruby', 'fill_hours')
    expect(api.save.mock.invocationCallOrder[0]).toBeLessThan(
      api.remove.mock.invocationCallOrder[0]
    )
    expect(props.onSaved).toHaveBeenCalledWith([ok, removed])
  })

  it('a rename whose remove fails says why; the new one stays', async () => {
    api.save.mockResolvedValue(ok)
    api.remove.mockResolvedValue({ error: 'refused', message: 'No schedule fill_hours' })
    const props = renderModal({ editing: schedule() })
    fireEvent.change(nameField(), { target: { value: 'morning' } })
    await clickSave('Save')
    expect(toast.error).toHaveBeenCalledWith('No schedule fill_hours')
    expect(props.onSaved).toHaveBeenCalledWith([ok])
  })

  it('a refused add removes nothing', async () => {
    api.save.mockResolvedValue({ error: 'refused', message: 'Ruby not found' })
    renderModal({ editing: schedule() })
    fireEvent.change(nameField(), { target: { value: 'morning' } })
    await clickSave('Save')
    expect(screen.getByTestId('schedule-error')).toHaveTextContent('Ruby not found')
    expect(api.remove).not.toHaveBeenCalled()
  })

  it('says how many missing files an edit left out', () => {
    renderModal({
      editing: schedule({
        selection: { kind: 'files', files: ['spec/a_spec.rb', 'spec/b_spec.rb'] }
      }),
      files: ['spec/a_spec.rb'],
      dropped: 1
    })
    expect(screen.getByTestId('schedule-files-dropped')).toHaveTextContent(
      '1 missing test file was left out.'
    )
    expect(screen.getByLabelText('Ticked test (1)')).toBeChecked()
  })

  it('an edit with every file gone starts on All tests, said above the form', async () => {
    api.save.mockResolvedValue(ok)
    renderModal({
      editing: schedule({ selection: { kind: 'files', files: ['spec/gone_spec.rb'] } }),
      files: [],
      dropped: 1
    })
    expect(screen.getByTestId('schedule-files-dropped')).toHaveTextContent(
      '1 missing test file was left out.'
    )
    expect(screen.getByLabelText('Ticked tests (0)')).toBeDisabled()
    expect(screen.getByLabelText('All tests')).toBeChecked()
    await clickSave('Save')
    expect(sent()).toEqual(expect.objectContaining({ selection: { kind: 'all' } }))
  })

  it('shows a bad time inline and does not send', () => {
    renderModal()
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '25:00' } })
    expect(screen.getByRole('alert')).toHaveTextContent(en.schedules.scheduleModal.timeInvalid)
    expect(saveButton()).toBeDisabled()
  })

  it('maps error codes to copy', async () => {
    api.save.mockResolvedValue({ error: 'needs42' })
    renderModal()
    await clickSave()
    expect(screen.getByTestId('schedule-error')).toHaveTextContent(en.schedules.errors.needs42)
  })

  it('falls back to a plain message when the gem gives none', async () => {
    api.save.mockResolvedValue({ error: 'gem-output' })
    renderModal()
    await clickSave()
    expect(screen.getByTestId('schedule-error')).toHaveTextContent(en.schedules.cliFailed)
  })

  it('says Ruby is missing and does not send', async () => {
    useRubyStore.setState({ rubyCommand: null })
    renderModal()
    await clickSave()
    expect(screen.getByTestId('schedule-error')).toHaveTextContent(en.schedules.noRuby)
    expect(api.save).not.toHaveBeenCalled()
  })
})

describe('schedule helpers', () => {
  it('maps every error code', () => {
    expect(scheduleErrorText(t, { error: 'needs42' })).toBe(en.schedules.errors.needs42)
    expect(scheduleErrorText(t, { error: 'rubyCantRun' })).toBe(en.schedules.errors.rubyCantRun)
    expect(scheduleErrorText(t, { error: 'noReport' })).toBe(en.schedules.errors.noReport)
    expect(scheduleErrorText(t, { error: 'ruby' })).toBe(en.schedules.noRuby)
    expect(scheduleErrorText(t, { error: 'refused', message: 'No schedule x' })).toBe(
      'No schedule x'
    )
    expect(scheduleErrorText(t, { error: 'timeout' })).toBe(en.schedules.cliFailed)
  })

  it('words what a schedule runs', () => {
    expect(runsText(t, { kind: 'all' })).toBe('All tests')
    expect(runsText(t, { kind: 'tag', tag: 'smoke' })).toBe('Tag smoke')
    expect(runsText(t, { kind: 'files', files: ['a_spec.rb'] })).toBe('1 test')
    expect(runsText(t, { kind: 'files', files: ['a_spec.rb', 'b_spec.rb'] })).toBe('2 tests')
  })

  it('finds the soonest next run, skipping orphans', () => {
    const early = new Date(2026, 10, 11, 8, 0).toISOString()
    const late = new Date(2026, 10, 12, 8, 0).toISOString()
    expect(
      soonestNextRun([
        schedule({ nextRunAt: late }),
        { name: 'gone', orphan: true, osState: 'missing from schedules.yml', last: null },
        schedule({ name: 'b', nextRunAt: early })
      ])
    ).toBe(early)
    expect(soonestNextRun([])).toBeNull()
  })

  it('re-schedules a listed row as a valid request', () => {
    const daily = requestFromRule(schedule({ on: null, showBrowser: true }), 'darwin')
    expect(daily).not.toHaveProperty('on')
    expect(daily.showBrowser).toBe(true)
    expect(() => validateScheduleRequest(daily)).not.toThrow()
    const hourly = requestFromRule(schedule({ every: 'hour', at: '00:15' }), 'darwin')
    expect(() => validateScheduleRequest(hourly)).not.toThrow()
    const weekly = requestFromRule(schedule({ every: 'week', on: 'tue' }), 'darwin')
    expect(weekly.on).toBe('tue')
    expect(() => validateScheduleRequest(weekly)).not.toThrow()
    expect(requestFromRule(schedule({ showBrowser: true }), 'linux').showBrowser).toBe(false)
  })
})
