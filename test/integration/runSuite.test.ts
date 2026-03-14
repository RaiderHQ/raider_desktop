import { describe, it, expect, vi, beforeEach } from 'vitest'
import { exec } from 'child_process'
import { promises as fs } from 'fs'

vi.mock('child_process', () => {
  const exec = vi.fn()
  return { exec, default: { exec } }
})
vi.mock('fs', () => {
  const promises = {
    writeFile: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue('')
  }
  return {
    default: { promises },
    promises
  }
})

// appState is a module-level singleton — reset it between tests
vi.mock('../../src/main/handlers/appState', () => {
  const suites = new Map()
  return {
    appState: { suites },
    getRecordingSettings: vi.fn(() => ({ implicitWait: 0, explicitWait: 30 }))
  }
})

import runSuite from '../../src/main/handlers/testing/runSuite'
import { appState, getRecordingSettings } from '../../src/main/handlers/appState'

const mockExec = exec as ReturnType<typeof vi.fn>
const mockWriteFile = fs.writeFile as ReturnType<typeof vi.fn>

const suite = {
  id: 'suite-1',
  name: 'Login Suite',
  tests: [
    { id: 'test-1', name: 'Login test', url: 'http://x.com', steps: ['@driver.get("http://x.com")'] }
  ]
}

describe('runSuite handler (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    appState.suites.clear()
  })

  it('returns error when suite is not found', async () => {
    const result = await runSuite('nonexistent-id', 'ruby')
    expect(result.success).toBe(false)
    expect(result.output).toContain('not found')
  })

  it('writes a temp file for each test in the suite', async () => {
    appState.suites.set('suite-1', suite)
    mockExec.mockImplementation((_cmd: string, _opts: object, cb: Function) => {
      cb(null, '{"summary": {}}', '')
    })
    await runSuite('suite-1', 'ruby')
    expect(mockWriteFile).toHaveBeenCalledTimes(1)
  })

  it('runs rspec with the correct ruby command', async () => {
    appState.suites.set('suite-1', suite)
    mockExec.mockImplementation((_cmd: string, _opts: object, cb: Function) => {
      cb(null, '{"summary": {}}', '')
    })
    await runSuite('suite-1', 'eval "$(rbenv init -)" && ruby')
    const cmd = mockExec.mock.calls[0][0] as string
    expect(cmd).toContain('rspec')
    expect(cmd).toContain('eval "$(rbenv init -)"')
    expect(cmd).toContain('--format json')
  })

  it('returns success with stdout output when rspec succeeds', async () => {
    appState.suites.set('suite-1', suite)
    mockExec.mockImplementation((_cmd: string, _opts: object, cb: Function) => {
      cb(null, '{"summary": "ok"}', '')
    })
    const result = await runSuite('suite-1', 'ruby')
    expect(result.success).toBe(true)
    expect(result.output).toContain('summary')
  })

  it('returns failure with stderr when rspec has no stdout', async () => {
    appState.suites.set('suite-1', suite)
    mockExec.mockImplementation((_cmd: string, _opts: object, cb: Function) => {
      cb(new Error('failed'), '', 'rspec error output')
    })
    const result = await runSuite('suite-1', 'ruby')
    expect(result.success).toBe(false)
    expect(result.output).toContain('rspec error output')
  })

  it('cleans up temp files after running', async () => {
    appState.suites.set('suite-1', suite)
    mockExec.mockImplementation((_cmd: string, _opts: object, cb: Function) => {
      cb(null, '{}', '')
    })
    const mockUnlink = fs.unlink as ReturnType<typeof vi.fn>
    await runSuite('suite-1', 'ruby')
    expect(mockUnlink).toHaveBeenCalledTimes(1)
  })

  it('uses recording settings for wait times', async () => {
    appState.suites.set('suite-1', {
      ...suite,
      tests: [{ id: 'test-1', name: 'Test', url: '', steps: [] }]
    });
    (getRecordingSettings as ReturnType<typeof vi.fn>).mockReturnValue({
      implicitWait: 5,
      explicitWait: 60
    })
    mockExec.mockImplementation((_cmd: string, _opts: object, cb: Function) => cb(null, '{}', ''))
    await runSuite('suite-1', 'ruby')
    const writtenCode = (mockWriteFile.mock.calls[0][1] as string)
    expect(writtenCode).toContain('implicit_wait = 5')
    expect(writtenCode).toContain('timeout: 60')
  })
})
