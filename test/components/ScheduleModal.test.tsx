import { render, screen, fireEvent, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import toast from 'react-hot-toast'
import en from '../../src/renderer/src/assets/translations/en.json'
import ScheduleModal, { buildSchedule } from '@components/Schedules/ScheduleModal'
import { lastResultText, nextRunText, scheduleText } from '@components/Schedules/scheduleText'
import useRubyStore from '@foundation/Stores/rubyStore'
import { validateSchedule } from '@shared/schedules'
import type { FlowLastRun, GemScheduleRule } from '@shared/types/schedules'

/** en.json with {{placeholders}} filled, so the tests read the real copy */
const t = (key: string, options: Record<string, unknown> = {}): string => {
  const text = key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], en)
  if (typeof text !== 'string') return key
  return text.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(options[name] ?? ''))
}

vi.mock('react-i18next', () => ({ useTranslation: (): { t: typeof t } => ({ t }) }))
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }))

/** A local time today (or `daysAgo` before), so the text doesn't depend on the time zone */
const at = (hours: number, minutes: number, daysAgo = 0): string => {
  const d = new Date(2026, 10, 10, hours, minutes)
  d.setDate(d.getDate() - daysAgo)
  return d.toISOString()
}
const now = new Date(2026, 10, 10, 12, 0)

const last = (patch: Partial<FlowLastRun> = {}): FlowLastRun => ({
  status: 'completed',
  finishedAt: at(8, 0),
  failedStep: null,
  resultsDir: 'flow-results/fill_hours/20261110T070000Z',
  ...patch
})

const schedule = (patch: Partial<GemScheduleRule> = {}): GemScheduleRule => ({
  name: 'fill_hours',
  every: 'weekday',
  at: '08:00',
  on: null,
  retries: 0,
  inputs: {},
  notify: false,
  nextRunAt: null,
  osState: 'ok',
  last: null,
  ...patch
})

const api = {
  scheduleFlow: vi.fn(),
  openDocs: vi.fn()
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.values(api).forEach((f) => f.mockReset())
  ;(window as unknown as { api: typeof api }).api = api
  useRubyStore.setState({ rubyCommand: 'ruby' })
})

describe('schedule texts', () => {
  it('words the last result', () => {
    expect(lastResultText(t, null, now)).toBe('Not run yet')
    expect(lastResultText(t, last(), now)).toBe('Completed 08:00 today')
    expect(
      lastResultText(
        t,
        last({ status: 'failed', failedStep: { number: 4, title: 'Save', line: 9 } }),
        now
      )
    ).toBe('Failed at step 4, 08:00 today')
    expect(
      lastResultText(t, last({ status: 'failed', failedStep: { title: 'x', line: 7 } }), now)
    ).toBe('Failed at line 7, 08:00 today')
    expect(lastResultText(t, last({ status: 'setup_error' }), now)).toBe(
      'Could not start, 08:00 today'
    )
    expect(lastResultText(t, last({ finishedAt: at(8, 0, 1) }), now)).toBe(
      'Completed 08:00 yesterday'
    )
  })

  it('words each schedule preset', () => {
    expect(scheduleText(t, schedule({ every: 'weekday' }))).toBe('Every weekday at 08:00')
    expect(scheduleText(t, schedule({ every: 'hour', at: '00:15' }))).toBe('Every hour at :15')
    expect(scheduleText(t, schedule({ every: 'day' }))).toBe('Every day at 08:00')
    expect(scheduleText(t, schedule({ every: 'week', on: 'mon' }))).toBe('Every Monday at 08:00')
    expect(scheduleText(t, schedule({ notify: true }))).toBe(
      'Every weekday at 08:00, notify on failure'
    )
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
    const base = { time: '08:00', day: 'tue' as const, retries: 2, notify: true, inputs: {} }
    expect(validateSchedule(buildSchedule({ ...base, every: 'hour', time: '15' }))).toEqual({
      every: 'hour',
      at: '00:15',
      retries: 2,
      notify: true,
      inputs: {}
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

  const renderModal = (onScheduled = vi.fn()): void => {
    render(
      <ScheduleModal
        name="fill_hours"
        title="Fill hours"
        inputs={[{ name: 'hours', default: '8' }]}
        schedule={null}
        onClose={vi.fn()}
        onScheduled={onScheduled}
      />
    )
  }

  it('sends an hourly schedule with notify on by default', async () => {
    api.scheduleFlow.mockResolvedValue({ ok: true, message: 'Scheduled fill_hours' })
    const onScheduled = vi.fn()
    renderModal(onScheduled)
    fireEvent.change(screen.getByLabelText('Repeat'), { target: { value: 'hour' } })
    fireEvent.change(screen.getByLabelText('Minute past the hour'), { target: { value: '15' } })
    expect(screen.getByText(en.flows.scheduleModal.inputsHint)).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Schedule' }))
    })
    expect(api.scheduleFlow).toHaveBeenCalledWith('ruby', 'fill_hours', {
      every: 'hour',
      at: '00:15',
      retries: 0,
      notify: true,
      inputs: { hours: '8' }
    })
    expect(toast.success).toHaveBeenCalledWith('Scheduled fill_hours')
    expect(onScheduled).toHaveBeenCalled()
  })

  it('shows a bad time inline and does not send', () => {
    renderModal()
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '25:00' } })
    expect(screen.getByRole('alert')).toHaveTextContent(en.flows.scheduleModal.timeInvalid)
    expect(screen.getByRole('button', { name: 'Schedule' })).toBeDisabled()
  })

  it('asks for a day on a weekly schedule', async () => {
    api.scheduleFlow.mockResolvedValue({ ok: true, message: '' })
    renderModal()
    fireEvent.change(screen.getByLabelText('Repeat'), { target: { value: 'week' } })
    fireEvent.change(screen.getByLabelText('Day'), { target: { value: 'fri' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Schedule' }))
    })
    expect(api.scheduleFlow).toHaveBeenCalledWith(
      'ruby',
      'fill_hours',
      expect.objectContaining({ every: 'week', on: 'fri' })
    )
  })

  it("shows the gem's refusal", async () => {
    api.scheduleFlow.mockResolvedValue({ error: 'refused', message: 'Ruby not found' })
    renderModal()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Schedule' }))
    })
    expect(screen.getByTestId('schedule-error')).toHaveTextContent('Ruby not found')
  })
})
