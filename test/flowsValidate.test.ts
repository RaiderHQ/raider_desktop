import { describe, it, expect } from 'vitest'
import {
  FLOW_INPUT_NAME,
  scheduleArgs,
  validateFlowInputs,
  validateSchedule
} from '../src/shared/flows'

const base = { every: 'day', at: '09:30', retries: 1, notify: false, inputs: {} }

describe('FLOW_INPUT_NAME', () => {
  it('takes a lower-case name of up to 40 starting with a letter', () => {
    expect(FLOW_INPUT_NAME.test('hours')).toBe(true)
    expect(FLOW_INPUT_NAME.test('a'.repeat(40))).toBe(true)
    expect(FLOW_INPUT_NAME.test('a'.repeat(41))).toBe(false)
    expect(FLOW_INPUT_NAME.test('1abc')).toBe(false)
    expect(FLOW_INPUT_NAME.test('Abc')).toBe(false)
  })
})

describe('validateFlowInputs', () => {
  it('returns a fresh copy of valid inputs', () => {
    const given = { hours: '5', user_name: 'Ana' }
    const result = validateFlowInputs(given)
    expect(result).toEqual(given)
    expect(result).not.toBe(given)
  })

  it('takes 20 entries and refuses 21', () => {
    const entries = (n: number): Record<string, string> =>
      Object.fromEntries(Array.from({ length: n }, (_, i) => [`k${i}`, 'v']))
    expect(Object.keys(validateFlowInputs(entries(20)))).toHaveLength(20)
    expect(() => validateFlowInputs(entries(21))).toThrow()
  })

  it('takes a 2000-char value and refuses 2001', () => {
    expect(validateFlowInputs({ a: 'x'.repeat(2000) }).a).toHaveLength(2000)
    expect(() => validateFlowInputs({ a: 'x'.repeat(2001) })).toThrow()
  })

  it.each(['a\u0000b', 'a\nb', 'a\rb', 'a\tb', 'a\u001fb', 'a\u007fb'])(
    'refuses a control character in %j',
    (value) => {
      expect(() => validateFlowInputs({ a: value })).toThrow()
    }
  )

  it('keeps shell syntax as plain text', () => {
    expect(validateFlowInputs({ a: '$(rm -rf ~); echo' }).a).toBe('$(rm -rf ~); echo')
  })

  it.each([['Bad'], ['1x'], ['__proto__'], ['a-b'], ['']])('refuses the name %j', (name) => {
    expect(() => validateFlowInputs(JSON.parse(`{${JSON.stringify(name)}:"v"}`))).toThrow()
  })

  it.each([[null], [[]], ['x'], [new Date()], [Object.create({ a: '1' })]])(
    'refuses %j as the inputs',
    (value) => {
      expect(() => validateFlowInputs(value)).toThrow()
    }
  )

  it('refuses a non-string value', () => {
    expect(() => validateFlowInputs({ a: 5 })).toThrow()
  })
})

describe('validateSchedule', () => {
  it('accepts a valid schedule and drops nothing', () => {
    expect(validateSchedule({ ...base, inputs: { hours: '5' } })).toEqual({
      ...base,
      inputs: { hours: '5' }
    })
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
    ['missing inputs', { every: 'day', at: '09:30', retries: 0, notify: false }],
    ['bad inputs', { ...base, inputs: { a: 'x\n' } }],
    ['not an object', 'daily'],
    ['an array', []]
  ])('refuses %s', (_label, value) => {
    expect(() => validateSchedule(value)).toThrow()
  })
})

describe('scheduleArgs', () => {
  it('builds the daily argv with inputs last', () => {
    const s = validateSchedule({ ...base, notify: true, inputs: { hours: '5', who: 'a=b' } })
    expect(scheduleArgs('report', s)).toEqual([
      'schedule',
      'report',
      '--every',
      'day',
      '--at',
      '09:30',
      '--retries',
      '1',
      '--notify',
      '--input',
      'hours=5',
      'who=a=b'
    ])
  })

  it('puts every input after a single --input (Thor keeps only the last repeated flag)', () => {
    const s = validateSchedule({ ...base, inputs: { hours: '5', project: 'Apollo' } })
    const args = scheduleArgs('log_hours', s)
    expect(args.filter((a) => a === '--input')).toHaveLength(1)
    expect(args.slice(-3)).toEqual(['--input', 'hours=5', 'project=Apollo'])
  })

  it('adds no --input when the flow has no inputs', () => {
    expect(scheduleArgs('r', validateSchedule(base))).not.toContain('--input')
  })

  it('keeps a value that starts with - inside its name=value token', () => {
    const s = validateSchedule({ ...base, inputs: { delta: '-5', flag: '--project' } })
    expect(scheduleArgs('r', s).slice(-3)).toEqual(['--input', 'delta=-5', 'flag=--project'])
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
