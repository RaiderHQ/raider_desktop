import { describe, it, expect } from 'vitest'
import { isRubyVersionSufficient, formatMinimumVersion } from '../../src/main/utils/rubyVersion'

describe('rubyVersion', () => {
  it('rejects Ruby 3.1', () => {
    expect(isRubyVersionSufficient(3, 1)).toBe(false)
  })

  it('accepts Ruby 3.2 and above', () => {
    expect(isRubyVersionSufficient(3, 2)).toBe(true)
    expect(isRubyVersionSufficient(3, 4)).toBe(true)
    expect(isRubyVersionSufficient(4, 0)).toBe(true)
  })

  it('rejects Ruby 2.x', () => {
    expect(isRubyVersionSufficient(2, 7)).toBe(false)
  })

  it('formats the minimum version as 3.2.0', () => {
    expect(formatMinimumVersion()).toBe('3.2.0')
  })
})
