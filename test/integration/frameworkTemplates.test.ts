import { describe, it, expect } from 'vitest'
import { getExportExtension, getExportFilters } from '../../src/main/handlers/frameworkTemplates'

// ---------------------------------------------------------------------------
// Export settings
// ---------------------------------------------------------------------------

describe('getExportExtension', () => {
  it('returns "rb" for cucumber until feature generation lands', () => {
    expect(getExportExtension('cucumber')).toBe('rb')
  })

  it('returns "rb" for rspec', () => {
    expect(getExportExtension('rspec')).toBe('rb')
  })

  it('returns "rb" for null', () => {
    expect(getExportExtension(null)).toBe('rb')
  })
})

describe('getExportFilters', () => {
  it('returns ruby filters for rspec', () => {
    const filters = getExportFilters('rspec')
    expect(filters[0].name).toBe('Ruby Scripts')
    expect(filters[0].extensions).toContain('rb')
  })

  it('returns ruby filters for null', () => {
    const filters = getExportFilters(null)
    expect(filters[0].extensions).toContain('rb')
  })
})
