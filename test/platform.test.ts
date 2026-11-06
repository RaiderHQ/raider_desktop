import { describe, it, expect } from 'vitest'
import { platformFrom } from '../src/shared/platform'

describe('platformFrom', () => {
  it('knows a Mac', () => {
    expect(platformFrom('MacIntel')).toBe('mac')
    expect(platformFrom('macos')).toBe('mac')
  })
  it('treats anything else as other', () => {
    expect(platformFrom('Win32')).toBe('other')
    expect(platformFrom('Linux x86_64')).toBe('other')
    expect(platformFrom(undefined)).toBe('other')
  })
})
