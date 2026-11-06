import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { exec } from 'child_process'

const { mockExistsSync, mockLstatSync, mockRmSync } = vi.hoisted(() => ({
  mockExistsSync: vi.fn(() => true),
  // Before the command runs nothing is at the project path; afterwards a real folder is.
  mockLstatSync: vi.fn(),
  mockRmSync: vi.fn()
}))

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  const patched = { existsSync: mockExistsSync, lstatSync: mockLstatSync, rmSync: mockRmSync }
  return { ...actual, ...patched, default: { ...actual, ...patched } }
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

const ENOENT = Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
const asDirectory = { isDirectory: () => true, isSymbolicLink: () => false }
const asSymlink = { isDirectory: () => false, isSymbolicLink: () => true }

/** Nothing at the project path before the run; a plain folder there after it. */
function nothingThereThenFolder(): void {
  mockLstatSync.mockImplementationOnce(() => {
    throw ENOENT
  })
  mockLstatSync.mockImplementation(() => asDirectory)
}

const fakeChild = () => ({
  stdin: { end: vi.fn(), on: vi.fn() },
  on: vi.fn(),
  kill: vi.fn(),
  killed: false
})
let lastChild: ReturnType<typeof fakeChild>

// Simulate a successful exec call
function mockExecSuccess(stdout = 'Project created') {
  mockExec.mockImplementation((_cmd: string, _opts: object, cb: Function) => {
    cb(null, stdout, '')
    lastChild = fakeChild()
    return lastChild
  })
}

// Simulate a failing exec call
function mockExecError(msg = 'command not found') {
  mockExec.mockImplementation((_cmd: string, _opts: object, cb: Function) => {
    cb(new Error(msg), '', msg)
    lastChild = fakeChild()
    return lastChild
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
    mockExistsSync.mockReturnValue(true)
    nothingThereThenFolder()
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
    ['spaces', 'my project'],
    ['command substitution', '$(whoami)'],
    ['a parent path', '../outside'],
    ['a path separator', 'a/b'],
    ['a leading hyphen', '-force']
  ])('refuses to run with a project name that has %s', async (_n, name) => {
    mockExecSuccess()
    const result = await handler({} as any, '/tmp/projects', name, 'rspec', 'selenium', 'ruby')
    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid projectName')
    expect(mockExec).not.toHaveBeenCalled()
  })

  describe('shell environment (D1, D4)', () => {
    const savedLang = process.env.LANG
    afterEach(() => {
      if (savedLang === undefined) delete process.env.LANG
      else process.env.LANG = savedLang
    })

    it('runs raider with a UTF-8 LANG when the app was launched without one', async () => {
      delete process.env.LANG
      mockExecSuccess()
      await handler(...validArgs)
      const opts = mockExec.mock.calls[0][1] as { env?: NodeJS.ProcessEnv }
      expect(opts.env?.LANG).toBe('en_US.UTF-8')
    })

    it('closes stdin so Thor can never wait on a prompt', async () => {
      mockExecSuccess()
      await handler(...validArgs)
      expect(lastChild.stdin.end).toHaveBeenCalled()
    })
  })

  describe('existing folder (D4)', () => {
    it.each([
      ['a folder', asDirectory],
      ['a symlink', asSymlink],
      ['a file', { isDirectory: () => false, isSymbolicLink: () => false }]
    ])('refuses to create over %s with the same name', async (_what, entry) => {
      mockLstatSync.mockReset().mockImplementation(() => entry)
      mockExecSuccess()
      const result = await handler(...validArgs)
      expect(result.success).toBe(false)
      expect(result.error).toBe('A folder named "my_project" already exists in /tmp/projects.')
      expect(mockExec).not.toHaveBeenCalled()
    })

    it('removes the half-made folder when raider fails', async () => {
      mockExecError('invalid multibyte char (US-ASCII)')
      const result = await handler(...validArgs)
      expect(result.success).toBe(false)
      expect(mockRmSync).toHaveBeenCalledWith('/tmp/projects/my_project', {
        recursive: true,
        force: true
      })
    })

    it('leaves the folder alone when raider exited 0 but wrote only to stderr', async () => {
      // The stderr heuristic reports a failure; the folder may still be a whole project
      mockExec.mockImplementation((_cmd: string, _opts: object, cb: Function) => {
        cb(null, '', 'warning: something')
        lastChild = fakeChild()
        return lastChild
      })
      const result = await handler(...validArgs)
      expect(result.success).toBe(false)
      expect(mockRmSync).not.toHaveBeenCalled()
    })

    it('leaves the folder alone after a timeout, since raider may still be writing to it', async () => {
      mockExec.mockImplementation((_cmd: string, _opts: object, cb: Function) => {
        cb(Object.assign(new Error('killed'), { killed: true }), '', '')
        lastChild = fakeChild()
        return lastChild
      })
      const result = await handler(...validArgs)
      expect(result.success).toBe(false)
      expect(result.error).toContain('timed out')
      expect(mockRmSync).not.toHaveBeenCalled()
    })

    it('leaves the path alone after a failure when it is not a plain folder', async () => {
      mockLstatSync.mockReset()
      mockLstatSync.mockImplementationOnce(() => {
        throw ENOENT
      })
      mockLstatSync.mockImplementation(() => asSymlink)
      mockExecError()
      await handler(...validArgs)
      expect(mockRmSync).not.toHaveBeenCalled()
    })

    it('keeps the folder after a successful run', async () => {
      mockExecSuccess()
      await handler(...validArgs)
      expect(mockRmSync).not.toHaveBeenCalled()
    })
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
      mockExec.mockClear()
      nothingThereThenFolder()
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
      mockExec.mockClear()
      nothingThereThenFolder()
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
