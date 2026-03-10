import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/main/handlers/isRbenvRubyInstalled', () => ({
  default: vi.fn()
}))
vi.mock('../../src/main/handlers/isRvmRubyInstalled', () => ({
  default: vi.fn()
}))
vi.mock('../../src/main/handlers/isSystemRubyInstalled', () => ({
  default: vi.fn()
}))
vi.mock('../../src/main/handlers/checkRubyDependencies', () => ({
  default: vi.fn()
}))

import handler from '../../src/main/handlers/isRubyInstalled'
import isRbenvRubyInstalled from '../../src/main/handlers/isRbenvRubyInstalled'
import isRvmRubyInstalled from '../../src/main/handlers/isRvmRubyInstalled'
import isSystemRubyInstalled from '../../src/main/handlers/isSystemRubyInstalled'
import checkRubyDependencies from '../../src/main/handlers/checkRubyDependencies'

const mockRbenv = isRbenvRubyInstalled as ReturnType<typeof vi.fn>
const mockRvm = isRvmRubyInstalled as ReturnType<typeof vi.fn>
const mockSystem = isSystemRubyInstalled as ReturnType<typeof vi.fn>
const mockDeps = checkRubyDependencies as ReturnType<typeof vi.fn>

describe('isRubyInstalled handler (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns rbenv ruby command when rbenv is found and deps are satisfied', async () => {
    mockRbenv.mockResolvedValue({ success: true, version: '3.3.0' })
    mockDeps.mockResolvedValue({ success: true, missingGems: [] })

    const result = await handler()
    expect(result.success).toBe(true)
    expect(result.rubyCommand).toContain('rbenv')
    expect(result.rubyCommand).toContain('ruby')
  })

  it('returns success=false with missingGems when rbenv found but gems missing', async () => {
    mockRbenv.mockResolvedValue({ success: true, version: '3.3.0' })
    mockDeps.mockResolvedValue({ success: false, missingGems: ['selenium-webdriver'] })

    const result = await handler()
    expect(result.success).toBe(false)
    expect(result.missingGems).toContain('selenium-webdriver')
    // rubyCommand is still returned so the gems modal can install them
    expect(result.rubyCommand).toBeDefined()
  })

  it('falls through to rvm when rbenv not found', async () => {
    mockRbenv.mockResolvedValue({ success: false })
    mockRvm.mockResolvedValue({ success: true, version: '3.2.0' })
    mockDeps.mockResolvedValue({ success: true, missingGems: [] })

    const result = await handler()
    expect(result.success).toBe(true)
    expect(result.rubyCommand).toContain('ruby')
    expect(mockRvm).toHaveBeenCalled()
  })

  it('falls through to system ruby when rbenv and rvm both fail', async () => {
    mockRbenv.mockResolvedValue({ success: false })
    mockRvm.mockResolvedValue({ success: false })
    mockSystem.mockResolvedValue({ success: true })
    mockDeps.mockResolvedValue({ success: true, missingGems: [] })

    const result = await handler()
    expect(result.success).toBe(true)
    expect(result.rubyCommand).toBe('ruby')
  })

  it('returns error when no ruby manager is found at all', async () => {
    mockRbenv.mockResolvedValue({ success: false })
    mockRvm.mockResolvedValue({ success: false })
    mockSystem.mockResolvedValue({ success: false })

    const result = await handler()
    expect(result.success).toBe(false)
    expect(result.error).toContain('No suitable Ruby version found')
  })
})
