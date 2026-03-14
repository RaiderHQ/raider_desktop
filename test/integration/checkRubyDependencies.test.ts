import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSafeExec = vi.fn()
vi.mock('../../src/main/utils/safeExec', () => ({
  safeExec: (...args: unknown[]) => mockSafeExec(...args)
}))

import handler from '../../src/main/handlers/ruby/checkRubyDependencies'

describe('checkRubyDependencies handler (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns success when all required gems are present', async () => {
    mockSafeExec.mockResolvedValue({ stdout: 'true', stderr: '', exitCode: 0 })
    const result = await handler('ruby')
    expect(result.success).toBe(true)
    expect(result.missingGems).toEqual([])
  })

  it('reports missing gems when gem list returns false', async () => {
    mockSafeExec.mockImplementation((cmd: string) => {
      if (cmd.includes('selenium-webdriver')) {
        return Promise.resolve({ stdout: 'false', stderr: '', exitCode: 0 })
      }
      return Promise.resolve({ stdout: 'true', stderr: '', exitCode: 0 })
    })
    const result = await handler('ruby')
    expect(result.success).toBe(false)
    expect(result.missingGems).toContain('selenium-webdriver')
  })

  it('reports gem as missing when exec returns an error', async () => {
    mockSafeExec.mockImplementation((cmd: string) => {
      if (cmd.includes('rspec')) {
        return Promise.resolve({ stdout: '', stderr: 'not found', exitCode: 1 })
      }
      return Promise.resolve({ stdout: 'true', stderr: '', exitCode: 0 })
    })
    const result = await handler('ruby')
    expect(result.success).toBe(false)
    expect(result.missingGems).toContain('rspec')
  })

  it('reports all gems as missing when exec always errors', async () => {
    mockSafeExec.mockResolvedValue({ stdout: '', stderr: 'no ruby', exitCode: 1 })
    const result = await handler('ruby')
    expect(result.success).toBe(false)
    expect(result.missingGems.length).toBe(3)
  })

  it('uses the provided rubyCommandPrefix in the gem check command', async () => {
    mockSafeExec.mockResolvedValue({ stdout: 'true', stderr: '', exitCode: 0 })
    await handler('eval "$(rbenv init -)" && ruby')
    const firstCall = mockSafeExec.mock.calls[0][0] as string
    expect(firstCall).toContain('eval "$(rbenv init -)"')
  })
})
