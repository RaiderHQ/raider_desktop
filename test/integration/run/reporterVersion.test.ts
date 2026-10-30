// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { reporterVersion, supportsLiveEvents } from '../../../src/main/handlers/run/reporterVersion'

describe('reporterVersion', () => {
  it('reads the locked version', () => {
    expect(reporterVersion('GEM\n  specs:\n    raider_reporter (0.11.2)\n      json\n')).toBe(
      '0.11.2'
    )
  })
  it('returns null when absent', () => {
    expect(reporterVersion('GEM\n  specs:\n    rspec (3.0.0)\n')).toBeNull()
  })
})

describe('supportsLiveEvents', () => {
  it('needs 0.11.0 or later', () => {
    expect(supportsLiveEvents('0.10.9')).toBe(false)
    expect(supportsLiveEvents('0.11.0')).toBe(true)
    expect(supportsLiveEvents('1.0.0')).toBe(true)
    expect(supportsLiveEvents(null)).toBe(false)
  })
})
