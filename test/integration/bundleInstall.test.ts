import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSafeExec = vi.fn()
vi.mock('../../src/main/utils/safeExec', () => ({
  safeExec: (...args: unknown[]) => mockSafeExec(...args)
}))

vi.mock('fix-path', () => ({
  default: vi.fn()
}))

import handler from '../../src/main/handlers/ruby/bundleInstall'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('bundleInstall handler', () => {
  it('returns success when bundle install succeeds', async () => {
    mockSafeExec.mockResolvedValue({ stdout: 'Bundle complete!', stderr: '', exitCode: 0 })

    const result = await handler('/project', 'ruby')

    expect(result.success).toBe(true)
    expect(result.output).toBe('Bundle complete!')
  })

  it('returns stderr as error when install fails with output', async () => {
    mockSafeExec.mockResolvedValue({
      stdout: '',
      stderr: 'Could not find gem ruby_raider',
      exitCode: 1
    })

    const result = await handler('/project', 'ruby')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Could not find gem ruby_raider')
  })

  it('returns meaningful error when install fails with empty output', async () => {
    mockSafeExec.mockResolvedValue({ stdout: '', stderr: '', exitCode: 1 })

    const result = await handler('/project', 'ruby')

    expect(result.success).toBe(false)
    expect(result.error).toContain('Bundle install failed')
    expect(result.error).toContain('exit code 1')
    expect(result.error).toContain('manually')
  })

  it('returns timeout error when exitCode is null', async () => {
    mockSafeExec.mockResolvedValue({ stdout: '', stderr: '', exitCode: null })

    const result = await handler('/project', 'ruby')

    expect(result.success).toBe(false)
    expect(result.error).toContain('timed out')
  })

  it('returns permission denied error', async () => {
    mockSafeExec.mockResolvedValue({
      stdout: '',
      stderr: 'permission denied - /usr/local/lib',
      exitCode: 1
    })

    const result = await handler('/project', 'ruby')

    expect(result.success).toBe(false)
    expect(result.error).toBe('permission.denied')
  })

  it('returns error for empty projectPath', async () => {
    const result = await handler('', 'ruby')

    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid projectPath')
  })

  it('returns error for empty rubyCommand', async () => {
    const result = await handler('/project', '')

    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid rubyCommand')
  })
})
