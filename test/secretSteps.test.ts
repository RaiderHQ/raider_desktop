import { describe, it, expect } from 'vitest'
import {
  isValidSecretName,
  missingSecrets,
  nameSecretStep,
  nextSecretName,
  withSecretNames
} from '../src/shared/secretSteps'
import type { Step } from '../src/shared/types/step'

const el = { strategy: 'css' as const, value: '#a' }
const secret = (id: string, secretName?: string): Step =>
  secretName
    ? { id, kind: 'type', element: el, text: '', secret: true, secretName }
    : { id, kind: 'type', element: el, text: '', secret: true }
const custom = (id: string, code: string): Step => ({ id, kind: 'custom', code })

describe('nextSecretName', () => {
  it('starts at RAIDER_SECRET_1', () => {
    expect(nextSecretName([])).toBe('RAIDER_SECRET_1')
  })

  it('takes the lowest number no step uses yet', () => {
    expect(nextSecretName([secret('a', 'RAIDER_SECRET_1'), secret('b', 'RAIDER_SECRET_3')])).toBe(
      'RAIDER_SECRET_2'
    )
  })

  it('counts names used in custom code, so a hand-edited secret keeps its variable', () => {
    const edited = custom(
      'a',
      "driver.find_element(id: 'pw').send_keys(ENV.fetch('RAIDER_SECRET_1'))"
    )
    expect(nextSecretName([edited])).toBe('RAIDER_SECRET_2')
  })

  it('ignores renamed variables that are not RAIDER_SECRET_<n>', () => {
    expect(nextSecretName([secret('a', 'ADMIN_PASSWORD')])).toBe('RAIDER_SECRET_1')
  })
})

describe('nameSecretStep', () => {
  it('names a new secret step from the steps already in its test', () => {
    expect(nameSecretStep(secret('b'), [secret('a', 'RAIDER_SECRET_1')])).toEqual(
      secret('b', 'RAIDER_SECRET_2')
    )
  })

  it('leaves other steps and named secrets alone', () => {
    const click: Step = { id: 'c', kind: 'click', element: el }
    expect(nameSecretStep(click, [])).toBe(click)
    const named = secret('d', 'USER_PASSWORD')
    expect(nameSecretStep(named, [])).toBe(named)
  })
})

describe('withSecretNames', () => {
  it('names old unnamed secret steps once, in order, around the names already taken', () => {
    const steps = [secret('a'), secret('b', 'RAIDER_SECRET_1'), secret('c')]
    expect(withSecretNames(steps)).toEqual([
      secret('a', 'RAIDER_SECRET_2'),
      secret('b', 'RAIDER_SECRET_1'),
      secret('c', 'RAIDER_SECRET_3')
    ])
  })

  it('returns the same list when every secret is named', () => {
    const steps = [secret('a', 'RAIDER_SECRET_2'), secret('b', 'RAIDER_SECRET_1')]
    expect(withSecretNames(steps)).toBe(steps)
  })

  it('never renumbers on reorder, insert or delete', () => {
    const named = withSecretNames([secret('a'), secret('b')])
    const reordered = [named[1], custom('x', 'puts 1'), named[0]]
    expect(withSecretNames(reordered)).toEqual(reordered)
    expect(withSecretNames([named[1]])).toEqual([secret('b', 'RAIDER_SECRET_2')])
  })
})

describe('isValidSecretName', () => {
  it.each(['RAIDER_SECRET_1', 'ADMIN_PASSWORD', 'A'])('accepts %s', (name) =>
    expect(isValidSecretName(name)).toBe(true)
  )
  it.each(['', 'admin', '1PASSWORD', 'MY-PASS', 'A B', '_X', "X'"])('refuses %j', (name) =>
    expect(isValidSecretName(name)).toBe(false)
  )
})

describe('missingSecrets', () => {
  it('lists the variables that are not set, once each, in order', () => {
    const steps = [secret('a', 'USER_PW'), secret('b', 'ADMIN_PW'), secret('c', 'USER_PW')]
    expect(missingSecrets(steps, { ADMIN_PW: 'x' })).toEqual(['USER_PW'])
    expect(missingSecrets(steps, { USER_PW: '', ADMIN_PW: 'x' })).toEqual([])
  })
})
