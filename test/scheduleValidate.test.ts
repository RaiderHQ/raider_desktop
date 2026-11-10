import { describe, it, expect } from 'vitest'
import { isScheduleName, scheduleArgs, validateSchedule } from '../src/shared/schedules'

const base = { every: 'day', at: '09:30', retries: 1, notify: false }

describe('validateSchedule', () => {
  it('accepts a valid schedule and drops nothing', () => {
    expect(validateSchedule({ ...base })).toEqual(base)
  })

  it('accepts a weekly schedule with a day', () => {
    expect(validateSchedule({ ...base, every: 'week', on: 'mon' }).on).toBe('mon')
  })

  it('accepts an hourly schedule', () => {
    expect(validateSchedule({ ...base, every: 'hour', at: '00:07' }).every).toBe('hour')
  })

  it.each([
    ['week without on', { ...base, every: 'week' }],
    ['on with day', { ...base, on: 'mon' }],
    ['unknown day', { ...base, every: 'week', on: 'monday' }],
    ['retries 4', { ...base, retries: 4 }],
    ['retries -1', { ...base, retries: -1 }],
    ['retries 1.5', { ...base, retries: 1.5 }],
    ['unknown key', { ...base, extra: 1 }],
    ['at 24:00', { ...base, at: '24:00' }],
    ['at 9:30', { ...base, at: '9:30' }],
    ['at 09:60', { ...base, at: '09:60' }],
    ['every month', { ...base, every: 'month' }],
    ['notify as string', { ...base, notify: 'yes' }],
    ['inputs', { ...base, inputs: { hours: '5' } }],
    ['not an object', 'daily'],
    ['an array', []]
  ])('refuses %s', (_label, value) => {
    expect(() => validateSchedule(value)).toThrow()
  })
})

describe('scheduleArgs', () => {
  it('builds the daily argv', () => {
    const s = validateSchedule({ ...base, notify: true })
    expect(scheduleArgs('report', s)).toEqual([
      'schedule',
      'report',
      '--every',
      'day',
      '--at',
      '09:30',
      '--retries',
      '1',
      '--notify'
    ])
  })

  it('sends no --input', () => {
    expect(scheduleArgs('r', validateSchedule(base))).not.toContain('--input')
  })

  it('uses :MM for an hourly rule and adds --on for a weekly one', () => {
    expect(scheduleArgs('r', validateSchedule({ ...base, every: 'hour', at: '13:07' }))).toEqual([
      'schedule',
      'r',
      '--every',
      'hour',
      '--at',
      ':07',
      '--retries',
      '1'
    ])
    expect(
      scheduleArgs('r', validateSchedule({ ...base, every: 'week', on: 'fri', retries: 0 }))
    ).toEqual([
      'schedule',
      'r',
      '--every',
      'week',
      '--at',
      '09:30',
      '--on',
      'fri',
      '--retries',
      '0'
    ])
  })
})

describe('isScheduleName', () => {
  it.each(['hello', 'fill_hours', 'a', '0_9', 'x'.repeat(60)])('accepts %s', (name) => {
    expect(isScheduleName(name)).toBe(true)
  })

  it.each(['', 'Hello', 'fill-hours', 'a b', '../x', 'x'.repeat(61), 'env'])(
    'refuses %j',
    (name) => {
      expect(isScheduleName(name)).toBe(false)
    }
  )
})
