import { describe, it, expect, vi, beforeEach } from 'vitest'
import { exec } from 'child_process'

vi.mock('electron', () => ({ app: { getPath: vi.fn() } }))
vi.mock('fix-path', () => ({ default: vi.fn() }))
vi.mock('child_process', () => {
  const exec = vi.fn()
  return { exec, default: { exec } }
})

import handler from '../../src/main/handlers/runRubyRaider'

const mockExec = exec as ReturnType<typeof vi.fn>

// Simulate a successful exec call
function mockExecSuccess(stdout = 'Project created') {
  mockExec.mockImplementation((_cmd: string, _opts: object, cb: Function) => {
    cb(null, stdout, '')
  })
}

// Simulate a failing exec call
function mockExecError(msg = 'command not found') {
  mockExec.mockImplementation((_cmd: string, _opts: object, cb: Function) => {
    cb(new Error(msg), '', msg)
  })
}

const validArgs: [any, string, string, string, string, string] = [
  {} as any,
  '/tmp/projects',
  'my_project',
  'rspec',
  'selenium',
  'ruby'
]

describe('runRubyRaider handler (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns success when exec succeeds', async () => {
    mockExecSuccess()
    const result = await handler(...validArgs)
    expect(result.success).toBe(true)
    expect(result.output).toBe('Project created')
  })

  it('builds the correct raider new command', async () => {
    mockExecSuccess()
    await handler(...validArgs)
    const call = mockExec.mock.calls[0][0] as string
    expect(call).toContain('raider new')
    expect(call).toContain('"my_project"')
    expect(call).toContain('framework:rspec')
    expect(call).toContain('automation:selenium')
  })

  it('returns error when exec fails', async () => {
    mockExecError('raider not found')
    const result = await handler(...validArgs)
    expect(result.success).toBe(false)
    expect(result.error).toContain('raider not found')
  })

  it('returns error when folderPath is empty', async () => {
    const result = await handler({} as any, '', 'name', 'rspec', 'selenium', 'ruby')
    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid folderPath')
  })

  it('returns error when projectName is empty', async () => {
    const result = await handler({} as any, '/tmp', '', 'rspec', 'selenium', 'ruby')
    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid projectName')
  })

  it('returns error when framework is empty', async () => {
    const result = await handler({} as any, '/tmp', 'proj', '', 'selenium', 'ruby')
    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid framework')
  })

  it('returns error when automation is empty', async () => {
    const result = await handler({} as any, '/tmp', 'proj', 'rspec', '', 'ruby')
    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid automation')
  })

  it('returns error when rubyCommand is empty', async () => {
    const result = await handler({} as any, '/tmp', 'proj', 'rspec', 'selenium', '')
    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid rubyCommand')
  })

  it('uses the mobile platform as automation when mobile param is given', async () => {
    mockExecSuccess()
    await handler({} as any, '/tmp', 'proj', 'rspec', 'appium', 'ruby', 'android')
    const call = mockExec.mock.calls[0][0] as string
    expect(call).toContain('automation:android')
  })
})
