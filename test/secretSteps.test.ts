import { describe, it, expect } from 'vitest'
import { missingSecrets, secretEnvNames } from '../src/shared/secretSteps'
import type { Step } from '../src/shared/types/step'

const el = { strategy: 'css' as const, value: '#a' }
const steps: Step[] = [
  { id: 'a', kind: 'type', element: el, text: 'me' },
  { id: 'b', kind: 'type', element: el, text: '', secret: true },
  { id: 'c', kind: 'click', element: el },
  { id: 'd', kind: 'type', element: el, text: '', secret: true }
]

describe('secretEnvNames', () => {
  it('numbers the secret steps of a test in order of appearance', () => {
    expect([...secretEnvNames(steps)]).toEqual([
      ['b', 'RAIDER_SECRET_1'],
      ['d', 'RAIDER_SECRET_2']
    ])
  })

  it('is empty for a test without secrets', () => {
    expect(secretEnvNames([steps[0], steps[2]]).size).toBe(0)
  })
})

describe('missingSecrets', () => {
  it('lists the variables that are not set, in order', () => {
    expect(missingSecrets(steps, { RAIDER_SECRET_2: 'x' })).toEqual(['RAIDER_SECRET_1'])
    expect(missingSecrets(steps, { RAIDER_SECRET_1: 'x', RAIDER_SECRET_2: '' })).toEqual([])
  })
})
