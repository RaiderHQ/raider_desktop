import { describe, it, expect } from 'vitest'
import { safeExec } from '../../src/main/utils/safeExec'

describe.skipIf(process.platform === 'win32')('safeExec closeStdin', () => {
  it('closes stdin so a command waiting for an answer gets end-of-file instead of hanging', async () => {
    const result = await safeExec('cat', { closeStdin: true, timeout: 5000 })
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe('')
  })

  it('leaves stdin open by default', async () => {
    const result = await safeExec('cat', { timeout: 300 })
    expect(result.exitCode).toBeNull()
    expect(result.stderr).toContain('timed out')
  })
})
