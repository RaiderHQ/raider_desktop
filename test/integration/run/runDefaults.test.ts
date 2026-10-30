// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { runDefaults, clampWorkers } from '../../../src/main/handlers/run/runDefaults'

describe('runDefaults', () => {
  it('recommends half the cpus, between 1 and 4', () => {
    expect(runDefaults(1)).toEqual({ recommendedWorkers: 1, maxWorkers: 1 })
    expect(runDefaults(6)).toEqual({ recommendedWorkers: 3, maxWorkers: 6 })
    expect(runDefaults(16)).toEqual({ recommendedWorkers: 4, maxWorkers: 16 })
  })
})

describe('clampWorkers', () => {
  it('clamps to [1, max]', () => {
    expect(clampWorkers(undefined, 8)).toBe(1)
    expect(clampWorkers(99, 8)).toBe(8)
    expect(clampWorkers(0, 8)).toBe(1)
    expect(clampWorkers(3, 8)).toBe(3)
  })
})
