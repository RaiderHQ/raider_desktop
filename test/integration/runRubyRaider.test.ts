import { describe, it, expect, vi, beforeEach } from 'vitest'
import { exec } from 'child_process'

const { mockExistsSync } = vi.hoisted(() => ({
  mockExistsSync: vi.fn(() => true)
}))

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  return { ...actual, default: { ...actual, existsSync: mockExistsSync }, existsSync: mockExistsSync }
})

vi.mock('electron', () => ({ app: { getPath: vi.fn() } }))
vi.mock('fix-path', () => ({ default: vi.fn() }))
vi.mock('child_process', () => {
  const exec = vi.fn()
  return { exec, default: { exec } }
})

import type { ProjectCreationOptions } from '../../src/shared/types/projectCreationTypes'
import handler from '../../src/main/handlers/project/runRubyRaider'

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
    expect(call).toContain('raider new my_project ')
    expect(call).toContain('framework:rspec')
    expect(call).toContain('automation:selenium')
  })

  it.each([
    ['ampersand', 'a&b', "'a&b'"],
    ['command substitution', '$(whoami)', "'$(whoami)'"],
    ['backticks', '`id`', "'`id`'"],
    ['spaces', 'my project', "'my project'"],
    ['single quote', "it's", "'it'\\''s'"],
    ['double quote', 'a"b', `'a"b'`]
  ])('quotes a project name with %s', async (_n, name, quoted) => {
    mockExecSuccess()
    await handler({} as any, '/tmp/projects', name, 'rspec', 'selenium', 'ruby')
    const call = mockExec.mock.calls[0][0] as string
    expect(call).toContain(`raider new ${quoted} -p`)
  })

  describe('ci option', () => {
    const run = async (
      options: ProjectCreationOptions | undefined,
      mobile: string | null = null
    ): Promise<string> => {
      mockExecSuccess()
      await handler(...validArgs, mobile, options)
      return mockExec.mock.calls[0][0] as string
    }

    it('adds ci:azure inside the -p list', async () => {
      const cmd = await run({ ci: 'azure', accessibility: true })
      expect(cmd).toContain('-p framework:rspec automation:selenium ci:azure')
      expect(cmd.indexOf('ci:azure')).toBeLessThan(cmd.indexOf('--accessibility'))
    })

    it('passes no ci for github or when absent', async () => {
      expect(await run({ ci: 'github' })).not.toContain('ci:')
      vi.clearAllMocks()
      expect(await run(undefined)).not.toContain('ci:')
    })

    it('ignores unknown providers', async () => {
      expect(await run({ ci: 'gitlab' as never })).not.toContain('ci:')
    })

    it('ignores azure for mobile projects', async () => {
      expect(await run({ ci: 'azure' }, 'android')).not.toContain('ci:')
    })
  })

  describe('examples option', () => {
    const run = async (options: ProjectCreationOptions | undefined): Promise<string> => {
      mockExecSuccess()
      await handler(...validArgs, null, options)
      return mockExec.mock.calls[0][0] as string
    }

    it('appends examples:false when false', async () => {
      expect(await run({ examples: false })).toContain(' examples:false')
    })

    it('passes nothing for true or absent', async () => {
      expect(await run({ examples: true })).not.toContain('examples:')
      vi.clearAllMocks()
      expect(await run(undefined)).not.toContain('examples:')
    })
  })

  it('never emits -r, --skip_ci or --ruby_version', async () => {
    mockExecSuccess()
    await handler(...validArgs, null, {
      accessibility: true,
      reporter: 'junit',
      skipCi: true,
      rubyVersion: '3.3.0'
    } as never)
    const call = mockExec.mock.calls[0][0] as string
    expect(call).not.toMatch(/ -r /)
    expect(call).not.toContain('--skip_ci')
    expect(call).not.toContain('--ruby_version')
    expect(call).toContain('--accessibility')
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

  it('returns error when command succeeds but project directory not created', async () => {
    mockExecSuccess()
    mockExistsSync.mockReturnValueOnce(false)

    const result = await handler(...validArgs)

    expect(result.success).toBe(false)
    expect(result.error).toContain('project directory was not created')
  })

  it('uses the mobile platform as automation when mobile param is given', async () => {
    mockExecSuccess()
    await handler({} as any, '/tmp', 'proj', 'rspec', 'appium', 'ruby', 'android')
    const call = mockExec.mock.calls[0][0] as string
    expect(call).toContain('automation:android')
  })
})
