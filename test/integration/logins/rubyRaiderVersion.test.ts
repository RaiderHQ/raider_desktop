// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  rubyRaiderVersion,
  supportsLoginReuse
} from '../../../src/main/handlers/logins/rubyRaiderVersion'

describe('rubyRaiderVersion', () => {
  it('reads the locked version', () => {
    expect(rubyRaiderVersion('GEM\n  specs:\n    ruby_raider (3.11.0)\n      thor\n')).toBe(
      '3.11.0'
    )
  })
  it('returns null when absent', () => {
    expect(rubyRaiderVersion('GEM\n  specs:\n    rspec (3.0.0)\n')).toBeNull()
  })
  it('ignores dependency lines', () => {
    expect(
      rubyRaiderVersion('GEM\n  specs:\n    foo (1.0.0)\n      ruby_raider (3.11.0)\n')
    ).toBeNull()
  })
})

describe('supportsLoginReuse', () => {
  it('needs 3.11.0 or later', () => {
    expect(supportsLoginReuse('3.11.0')).toBe(true)
    expect(supportsLoginReuse('4.0.0')).toBe(true)
    expect(supportsLoginReuse('3.10.2')).toBe(false)
    expect(supportsLoginReuse('2.12.0')).toBe(false)
    expect(supportsLoginReuse(null)).toBe(false)
  })
})
