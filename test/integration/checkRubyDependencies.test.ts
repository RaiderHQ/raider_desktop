import { describe, it, expect, vi, beforeEach } from 'vitest'
import { exec } from 'child_process'

vi.mock('child_process', () => {
  const exec = vi.fn()
  return { exec, default: { exec } }
})

import handler from '../../src/main/handlers/checkRubyDependencies'

const mockExec = exec as ReturnType<typeof vi.fn>

describe('checkRubyDependencies handler (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns success when all required gems are present', async () => {
    // gem list -i returns "true" for each gem
    mockExec.mockImplementation((_cmd: string, cb: Function) => {
      cb(null, 'true', '')
    })
    const result = await handler('ruby')
    expect(result.success).toBe(true)
    expect(result.missingGems).toEqual([])
  })

  it('reports missing gems when gem list returns false', async () => {
    mockExec.mockImplementation((cmd: string, cb: Function) => {
      if (cmd.includes('selenium-webdriver')) {
        cb(null, 'false', '')
      } else {
        cb(null, 'true', '')
      }
    })
    const result = await handler('ruby')
    expect(result.success).toBe(false)
    expect(result.missingGems).toContain('selenium-webdriver')
  })

  it('reports gem as missing when exec returns an error', async () => {
    mockExec.mockImplementation((cmd: string, cb: Function) => {
      if (cmd.includes('rspec')) {
        cb(new Error('not found'), '', 'not found')
      } else {
        cb(null, 'true', '')
      }
    })
    const result = await handler('ruby')
    expect(result.success).toBe(false)
    expect(result.missingGems).toContain('rspec')
  })

  it('reports all gems as missing when exec always errors', async () => {
    mockExec.mockImplementation((_cmd: string, cb: Function) => {
      cb(new Error('no ruby'), '', '')
    })
    const result = await handler('ruby')
    expect(result.success).toBe(false)
    expect(result.missingGems.length).toBe(3)
  })

  it('uses the provided rubyCommandPrefix in the gem check command', async () => {
    mockExec.mockImplementation((_cmd: string, cb: Function) => cb(null, 'true', ''))
    await handler('eval "$(rbenv init -)" && ruby')
    const firstCall = mockExec.mock.calls[0][0] as string
    expect(firstCall).toContain('eval "$(rbenv init -)"')
  })
})
