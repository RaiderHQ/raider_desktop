import { describe, it, expect, vi, beforeEach } from 'vitest'
import { exec } from 'child_process'

vi.mock('electron', () => ({ app: { getPath: vi.fn() } }))
vi.mock('fix-path', () => ({ default: vi.fn() }))
vi.mock('child_process', () => {
  const exec = vi.fn()
  return { exec, default: { exec } }
})

import handler from '../../src/main/handlers/config/updateBrowserUrl'

const mockExec = exec as ReturnType<typeof vi.fn>

function mockExecSuccess(stdout = 'URL updated') {
  mockExec.mockImplementation((_cmd: string, _opts: object, cb: Function) => {
    cb(null, stdout, '')
  })
}

function mockExecError(msg = 'command not found') {
  mockExec.mockImplementation((_cmd: string, _opts: object, cb: Function) => {
    cb(new Error(msg), '', msg)
  })
}

describe('updateBrowserUrl handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('builds the correct raider u url command', async () => {
    mockExecSuccess()
    await handler({} as any, '/my/project', 'https://example.com')
    const call = mockExec.mock.calls[0][0] as string
    expect(call).toContain('raider u url https://example.com')
    expect(call).toContain('/my/project')
  })

  it('returns success when command succeeds', async () => {
    mockExecSuccess('URL set to https://example.com')
    const result = await handler({} as any, '/my/project', 'https://example.com')
    expect(result.success).toBe(true)
    expect(result.output).toBe('URL set to https://example.com')
  })

  it('returns error when command fails', async () => {
    mockExecError('raider not found')
    const result = await handler({} as any, '/my/project', 'https://example.com')
    expect(result.success).toBe(false)
    expect(result.error).toContain('raider not found')
  })
})
