import { describe, it, expect, vi, beforeEach } from 'vitest'
import { exec } from 'child_process'

vi.mock('electron', () => ({ app: { getPath: vi.fn() } }))
vi.mock('fix-path', () => ({ default: vi.fn() }))
vi.mock('child_process', () => {
  const exec = vi.fn()
  return { exec, default: { exec } }
})

import handler from '../../src/main/handlers/checkBundle'

const mockExec = exec as ReturnType<typeof vi.fn>

describe('checkBundle handler (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns success when bundle check passes', async () => {
    mockExec.mockImplementation((_cmd: string, _opts: object, cb: Function) => {
      cb(null, 'The Gemfile\'s dependencies are satisfied', '')
    })
    const result = await handler('/project', 'ruby')
    expect(result.success).toBe(true)
  })

  it('returns failure when bundle check exits with error', async () => {
    mockExec.mockImplementation((_cmd: string, _opts: object, cb: Function) => {
      cb(new Error('gems missing'), '', 'Install missing gems by running `bundle install`')
    })
    const result = await handler('/project', 'ruby')
    expect(result.success).toBe(false)
    expect(result.error).toContain('Install missing gems')
  })

  it('builds a command containing bundle check', async () => {
    mockExec.mockImplementation((_cmd: string, _opts: object, cb: Function) => cb(null, '', ''))
    await handler('/project', 'ruby')
    expect(mockExec.mock.calls[0][0]).toContain('bundle check')
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
