import { describe, it, expect, vi, beforeEach } from 'vitest'
import { exec } from 'child_process'

vi.mock('electron', () => ({ app: { getPath: vi.fn() } }))
vi.mock('fix-path', () => ({ default: vi.fn() }))
vi.mock('child_process', () => {
  const exec = vi.fn()
  return { exec, default: { exec } }
})

import handler from '../../src/main/handlers/config/updateHeadlessMode'

const mockExec = exec as ReturnType<typeof vi.fn>

function mockExecSuccess(stdout = 'Headless mode updated') {
  mockExec.mockImplementation((_cmd: string, _opts: object, cb: Function) => {
    cb(null, stdout, '')
  })
}

function mockExecError(msg = 'command not found') {
  mockExec.mockImplementation((_cmd: string, _opts: object, cb: Function) => {
    cb(new Error(msg), '', msg)
  })
}

describe('updateHeadlessMode handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('builds the correct command to enable headless', async () => {
    mockExecSuccess()
    await handler({} as any, '/my/project', true)
    const call = mockExec.mock.calls[0][0] as string
    expect(call).toContain('raider u headless on')
    expect(call).toContain('/my/project')
  })

  it('builds the correct command to disable headless', async () => {
    mockExecSuccess()
    await handler({} as any, '/my/project', false)
    const call = mockExec.mock.calls[0][0] as string
    expect(call).toContain('raider u headless off')
  })

  it('returns success when command succeeds', async () => {
    mockExecSuccess('Headless mode enabled')
    const result = await handler({} as any, '/my/project', true)
    expect(result.success).toBe(true)
    expect(result.output).toBe('Headless mode enabled')
  })

  it('returns error when command fails', async () => {
    mockExecError('raider not found')
    const result = await handler({} as any, '/my/project', true)
    expect(result.success).toBe(false)
    expect(result.error).toContain('raider not found')
  })
})
