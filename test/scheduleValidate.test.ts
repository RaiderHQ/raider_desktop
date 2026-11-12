import { describe, it, expect } from 'vitest'
import {
  isScheduleName,
  isScheduleSpecFile,
  isScheduleTag,
  scheduleArgs,
  validateSchedule,
  validateScheduleRequest
} from '../src/shared/schedules'

const base = { every: 'day', at: '09:30', retries: 1, notify: false }
const request = {
  ...base,
  name: 'nightly',
  showBrowser: false,
  selection: { kind: 'all' }
}

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

describe('validateScheduleRequest', () => {
  it('accepts a whole request and keeps every field', () => {
    expect(validateScheduleRequest(request)).toEqual(request)
  })

  it('accepts a tag and a list of files', () => {
    const tag = { ...request, selection: { kind: 'tag', tag: 'smoke:fast-1' } }
    expect(validateScheduleRequest(tag).selection).toEqual({ kind: 'tag', tag: 'smoke:fast-1' })
    const files = { ...request, selection: { kind: 'files', files: ['spec/a_spec.rb'] } }
    expect(validateScheduleRequest(files).selection).toEqual({
      kind: 'files',
      files: ['spec/a_spec.rb']
    })
  })

  it('drops duplicate files, keeping the order', () => {
    const files = ['spec/b_spec.rb', 'spec/a_spec.rb', 'spec/b_spec.rb']
    const valid = validateScheduleRequest({ ...request, selection: { kind: 'files', files } })
    expect(valid.selection).toEqual({ kind: 'files', files: ['spec/b_spec.rb', 'spec/a_spec.rb'] })
  })

  it('takes 200 files and refuses 201', () => {
    const files = (n: number): string[] => Array.from({ length: n }, (_, i) => `spec/t${i}_spec.rb`)
    expect(() =>
      validateScheduleRequest({ ...request, selection: { kind: 'files', files: files(200) } })
    ).not.toThrow()
    expect(() =>
      validateScheduleRequest({ ...request, selection: { kind: 'files', files: files(201) } })
    ).toThrow(/200/)
  })

  it.each(['../x', 'a b', 'A', 'x'.repeat(61), '-x', '', 'a;b', 7, null])(
    'refuses the name %j',
    (name) => {
      expect(() => validateScheduleRequest({ ...request, name })).toThrow()
    }
  )

  it.each([';rm', '--project', '-x', '--', 'a b', '', 'x'.repeat(201), 'a\nb', 5])(
    'refuses the tag %j',
    (tag) => {
      expect(() =>
        validateScheduleRequest({ ...request, selection: { kind: 'tag', tag } })
      ).toThrow()
    }
  )

  it.each([
    '../a_spec.rb',
    'spec/../../a_spec.rb',
    '/abs_spec.rb',
    '-x_spec.rb',
    '--project_spec.rb',
    'spec/a.rb',
    'spec/a_spec.rb\n',
    'spec\\a_spec.rb',
    '',
    3
  ])('refuses the file %j', (file) => {
    expect(() =>
      validateScheduleRequest({ ...request, selection: { kind: 'files', files: [file] } })
    ).toThrow()
  })

  it.each([
    ['tag and files together', { kind: 'tag', tag: 'smoke', files: ['spec/a_spec.rb'] }],
    ['files and a tag together', { kind: 'files', files: ['spec/a_spec.rb'], tag: 'smoke' }],
    ['all with a tag', { kind: 'all', tag: 'smoke' }],
    ['no files', { kind: 'files', files: [] }],
    ['files not a list', { kind: 'files', files: 'spec/a_spec.rb' }],
    ['unknown kind', { kind: 'some' }],
    ['not an object', 'all'],
    ['missing', undefined]
  ])('refuses a selection with %s', (_label, selection) => {
    expect(() => validateScheduleRequest({ ...request, selection })).toThrow()
  })

  it.each([
    ['an unknown key', { ...request, project: '/tmp' }],
    ['showBrowser as a string', { ...request, showBrowser: 'yes' }],
    ['no showBrowser', { ...request, showBrowser: undefined }],
    ['a bad rule', { ...request, every: 'month' }],
    ['not an object', 'nightly']
  ])('refuses a request with %s', (_label, value) => {
    expect(() => validateScheduleRequest(value)).toThrow()
  })
})

describe('scheduleArgs', () => {
  it('builds the daily argv for all tests', () => {
    const req = validateScheduleRequest({ ...request, notify: true })
    expect(scheduleArgs(req)).toEqual([
      'schedule',
      'add',
      'nightly',
      '--every',
      'day',
      '--at',
      '09:30',
      '--retries',
      '1',
      '--notify'
    ])
  })

  it('puts files positional right after the name and says --no-notify', () => {
    const req = validateScheduleRequest({
      ...request,
      selection: { kind: 'files', files: ['spec/a_spec.rb', 'spec/b c_spec.rb'] }
    })
    expect(scheduleArgs(req)).toEqual([
      'schedule',
      'add',
      'nightly',
      'spec/a_spec.rb',
      'spec/b c_spec.rb',
      '--every',
      'day',
      '--at',
      '09:30',
      '--retries',
      '1',
      '--no-notify'
    ])
  })

  it('uses :MM for an hourly rule, --on for a weekly one, --tag and --show-browser', () => {
    expect(
      scheduleArgs(
        validateScheduleRequest({
          ...request,
          every: 'hour',
          at: '13:07',
          showBrowser: true,
          selection: { kind: 'tag', tag: 'smoke' }
        })
      )
    ).toEqual([
      'schedule',
      'add',
      'nightly',
      '--every',
      'hour',
      '--at',
      ':07',
      '--tag',
      'smoke',
      '--show-browser',
      '--retries',
      '1',
      '--no-notify'
    ])
    expect(
      scheduleArgs(validateScheduleRequest({ ...request, every: 'week', on: 'fri', retries: 0 }))
    ).toEqual([
      'schedule',
      'add',
      'nightly',
      '--every',
      'week',
      '--at',
      '09:30',
      '--on',
      'fri',
      '--retries',
      '0',
      '--no-notify'
    ])
  })

  it('never names --project (gemCli puts it last)', () => {
    expect(scheduleArgs(validateScheduleRequest(request))).not.toContain('--project')
  })
})

describe('isScheduleName', () => {
  it.each(['hello', 'fill_hours', 'a', '0_9', 'x'.repeat(60), 'env'])('accepts %s', (name) => {
    expect(isScheduleName(name)).toBe(true)
  })

  it.each(['', 'Hello', 'fill-hours', 'a b', '../x', 'x'.repeat(61), '-x'])(
    'refuses %j',
    (name) => {
      expect(isScheduleName(name)).toBe(false)
    }
  )
})

describe('isScheduleTag / isScheduleSpecFile', () => {
  it('match the gem rules plus no leading dash', () => {
    expect(isScheduleTag('smoke:fast_1-a')).toBe(true)
    expect(isScheduleTag('-smoke')).toBe(false)
    expect(isScheduleSpecFile('spec/x/a_spec.rb')).toBe(true)
    expect(isScheduleSpecFile('spec/..a_spec.rb')).toBe(true)
    expect(isScheduleSpecFile('spec/../a_spec.rb')).toBe(false)
  })
})
