// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

vi.mock('electron', () => ({
  BrowserWindow: class {},
  app: { getPath: (): string => '/' },
  shell: { trashItem: vi.fn(), openPath: vi.fn(async () => '') }
}))

import { appState } from '../../src/main/handlers/appState'
import { registerFlowsIpc, type FlowsIpcDeps } from '../../src/main/handlers/flows/flowsIpc'
import { envValue } from '../../src/main/handlers/flows/flowEnv'
import type { ProjectLayout } from '../../src/shared/types/projectLayout'

const MAIN_ID = 7
const LAYOUT: ProjectLayout = {
  framework: 'rspec',
  automation: 'selenium',
  specPath: 'spec',
  featurePath: 'features',
  helperPath: 'helpers',
  recordable: true
}
const LOCK = (v: string): string => `GEM\n  specs:\n    ruby_raider (${v})\n      thor\n`
const SECRET = 'hunter2-s3cr3t-value'

type Handler = (event: unknown, ...args: unknown[]) => Promise<unknown>

let project: string
let handlers: Map<string, Handler>
let runFlowCli: ReturnType<typeof vi.fn>

const main = { sender: { id: MAIN_ID } }
const call = (channel: string, ...args: unknown[]): Promise<unknown> =>
  handlers.get(channel)!(main, ...args)
const set = (key: string, value: unknown): Promise<unknown> => call('set-flow-env', { key, value })
const envPath = (): string => path.join(project, '.raider', 'flows', 'env')
const readEnv = (): Promise<string> => fs.readFile(envPath(), 'utf8')
const mode = async (p: string): Promise<number> => (await fs.stat(p)).mode & 0o777

async function write(rel: string, body = ''): Promise<void> {
  await fs.mkdir(path.dirname(path.join(project, rel)), { recursive: true })
  await fs.writeFile(path.join(project, rel), body)
}

// Ruby's String#strip: ASCII whitespace and NUL only (not U+00A0 and friends)
const rubyStrip = (text: string): string => text.replace(/^[\t\n\v\f\r ]+|[\t\n\v\f\r ]+$/g, '')

/** What the gem's load_env_file makes of the file: strip, split on the first =, unquote one pair */
function gemParse(content: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const raw of content.split('\n')) {
    const line = rubyStrip(raw)
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 0) continue
    const key = rubyStrip(line.slice(0, eq))
    let value = rubyStrip(line.slice(eq + 1))
    if (value.length >= 2 && value[0] === value[value.length - 1] && `"'`.includes(value[0]))
      value = value.slice(1, -1)
    env[key] = value
  }
  return env
}

beforeEach(async () => {
  project = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'flow-env-')))
  await write('Gemfile.lock', LOCK('4.1.0'))
  appState.mainWindow = { webContents: { id: MAIN_ID } } as never
  appState.projectPath = project
  appState.layout = { ...LAYOUT }
  runFlowCli = vi.fn(async () => ({ ok: true, stdout: '' }))
  handlers = new Map()
  const ipcMain = {
    handle: (channel: string, fn: Handler): void => {
      handlers.set(channel, fn)
    }
  }
  registerFlowsIpc(ipcMain as never, { runFlowCli } as FlowsIpcDeps)
})

afterEach(async () => {
  vi.restoreAllMocks()
  appState.mainWindow = null
  appState.projectPath = null
  appState.layout = null
  await fs.rm(project, { recursive: true, force: true })
})

describe('gate', () => {
  it.each([
    ['list-flow-env-keys', []],
    ['set-flow-env', [{ key: 'TEST_USER', value: 'x' }]],
    ['remove-flow-env', [{ key: 'TEST_USER' }]]
  ])('%s refuses a sender that is not the main window', async (channel, args) => {
    expect(await handlers.get(channel)!({ sender: { id: 99 } }, ...args)).toEqual({
      error: 'invalid'
    })
  })

  it('answers no-project without an active project', async () => {
    appState.projectPath = null
    expect(await call('list-flow-env-keys')).toEqual({ error: 'no-project' })
    expect(await set('TEST_USER', 'x')).toEqual({ error: 'no-project' })
  })

  it('refuses a project whose gem predates flows', async () => {
    await write('Gemfile.lock', LOCK('4.0.0'))
    expect(await set('TEST_USER', 'x')).toEqual({ error: 'unsupported' })
    await expect(fs.lstat(path.join(project, '.raider'))).rejects.toThrow()
  })

  it('works before flows are set up (no flows/flow_helper.rb)', async () => {
    expect(await set('TEST_USER', 'me')).toEqual({ keys: ['TEST_USER'] })
    expect(runFlowCli).not.toHaveBeenCalled()
  })
})

describe('list-flow-env-keys', () => {
  it('is empty without a file and creates nothing', async () => {
    expect(await call('list-flow-env-keys')).toEqual({ keys: [] })
    await expect(fs.lstat(path.join(project, '.raider'))).rejects.toThrow()
  })

  it('lists keys only, in file order, de-duplicated, skipping comments and junk', async () => {
    await write(
      '.raider/flows/env',
      '# creds\nTEST_USER=me\n\nRAIDER_SECRET_API="tok"\nnot a pair\nlower=x\nRAIDER_FLOW_RUN_ID=1\n  TEST_USER = again\n'
    )
    const result = await call('list-flow-env-keys')
    expect(result).toEqual({ keys: ['TEST_USER', 'RAIDER_SECRET_API'] })
    expect(JSON.stringify(result)).not.toContain('tok')
  })
  it('skips a key padded with Unicode spaces, as Ruby strip keeps them', async () => {
    await write(
      '.raider/flows/env',
      '\u00a0TEST_USER=x\nTEST_PASSWORD\u00a0=y\n\tRAIDER_SECRET_A=z\n'
    )
    expect(await call('list-flow-env-keys')).toEqual({ keys: ['RAIDER_SECRET_A'] })
  })
})

describe('set-flow-env', () => {
  it('creates the file 0600 inside 0700 folders and returns keys only', async () => {
    const result = await set('RAIDER_SECRET_API', SECRET)
    expect(result).toEqual({ keys: ['RAIDER_SECRET_API'] })
    expect(JSON.stringify(result)).not.toContain(SECRET)
    expect(await readEnv()).toBe(`RAIDER_SECRET_API=${SECRET}\n`)
    expect(await mode(envPath())).toBe(0o600)
    expect(await mode(path.join(project, '.raider', 'flows'))).toBe(0o700)
    expect(await fs.readdir(path.join(project, '.raider', 'flows'))).toEqual(['env'])
  })

  it("leaves an existing .raider's mode alone", async () => {
    await fs.mkdir(path.join(project, '.raider'), { mode: 0o755 })
    await fs.chmod(path.join(project, '.raider'), 0o755)
    await set('TEST_USER', 'me')
    expect(await mode(path.join(project, '.raider'))).toBe(0o755)
  })

  it('narrows an existing 0644 file to 0600', async () => {
    await write('.raider/flows/env', 'TEST_USER=me\n')
    await fs.chmod(envPath(), 0o644)
    await set('TEST_PASSWORD', 'pw')
    expect(await mode(envPath())).toBe(0o600)
  })

  it('preserves other lines verbatim and replaces a key in place', async () => {
    await write(
      '.raider/flows/env',
      '# my secrets\nTEST_USER=old\r\nodd line\nRAIDER_SECRET_B=keep\n'
    )
    expect(await set('TEST_USER', 'new')).toEqual({ keys: ['TEST_USER', 'RAIDER_SECRET_B'] })
    expect(await readEnv()).toBe('# my secrets\nTEST_USER=new\nodd line\nRAIDER_SECRET_B=keep\n')
  })

  it('collapses later duplicates of the key it sets', async () => {
    await write('.raider/flows/env', 'TEST_USER=a\nTEST_PASSWORD=p\nTEST_USER=b\n')
    expect(await set('TEST_USER', 'c')).toEqual({ keys: ['TEST_USER', 'TEST_PASSWORD'] })
    expect(await readEnv()).toBe('TEST_USER=c\nTEST_PASSWORD=p\n')
  })

  it('appends a missing key, adding a newline when the file lacks one', async () => {
    await write('.raider/flows/env', 'TEST_USER=a')
    expect(await set('TEST_PASSWORD', 'p')).toEqual({ keys: ['TEST_USER', 'TEST_PASSWORD'] })
    expect(await readEnv()).toBe('TEST_USER=a\nTEST_PASSWORD=p\n')
  })

  it.each([
    'a b',
    ' lead',
    'trail ',
    'x#y',
    '#x',
    '"q"',
    "'q'",
    "it's",
    'say "hi"',
    'say "hi" #1',
    "it's #1",
    'a=b',
    '"',
    'a"b\'c',
    'x7"Q\'r#9',
    '"it\'s"',
    'a "b" \'c\'',
    ' "a\'b ',
    "'\"'",
    '\u00a0nbsp\u00a0'
  ])('round-trips %j through the gem parser', async (value) => {
    await write('.raider/flows/env', '# keep\nTEST_USER=me\n')
    expect(await set('RAIDER_SECRET_X', value)).toEqual({ keys: ['TEST_USER', 'RAIDER_SECRET_X'] })
    expect(gemParse(await readEnv())).toEqual({ TEST_USER: 'me', RAIDER_SECRET_X: value })
  })

  it.each([
    ['a"b\'c', 'a"b\'c'],
    ['x#y', 'x#y'],
    ['#x', '#x'],
    ['\u00a0x', '\u00a0x'],
    [' x', '" x"'],
    ['"q"', '\'"q"\''],
    ["'q'", `"'q'"`]
  ])('writes %j as %j', (value, written) => {
    expect(envValue(value)).toBe(written)
  })

  it.each([
    ['a lowercase key', { key: 'test_user', value: 'x' }],
    ['a key outside the allowed set', { key: 'PATH', value: 'x' }],
    ['a RAIDER_FLOW_ key', { key: 'RAIDER_FLOW_RUN_ID', value: 'x' }],
    ['a bare RAIDER_SECRET_', { key: 'RAIDER_SECRET_', value: 'x' }],
    ['a key over 100 chars', { key: `RAIDER_SECRET_${'A'.repeat(90)}`, value: 'x' }],
    ['an empty value', { key: 'TEST_USER', value: '' }],
    ['a value over 2000 chars', { key: 'TEST_USER', value: 'x'.repeat(2001) }],
    ['a value with a newline', { key: 'TEST_USER', value: 'a\nb' }],
    ['a value with a CR', { key: 'TEST_USER', value: 'a\rb' }],
    ['a value with NUL', { key: 'TEST_USER', value: 'a\0b' }],
    ['a value with a tab', { key: 'TEST_USER', value: 'a\tb' }],
    ['a value with DEL', { key: 'TEST_USER', value: 'a\u007fb' }],
    ['a non-string value', { key: 'TEST_USER', value: 12 }],
    ['an extra payload key', { key: 'TEST_USER', value: 'x', extra: 1 }],
    ['a missing value', { key: 'TEST_USER' }],
    ['an array payload', ['TEST_USER', 'x']],
    ['a null payload', null],
    [
      'a class instance payload',
      new (class P {
        key = 'TEST_USER'
        value = 'x'
      })()
    ]
  ])('refuses %s', async (_label, payload) => {
    expect(await call('set-flow-env', payload)).toEqual({ error: 'invalid' })
    await expect(fs.lstat(path.join(project, '.raider'))).rejects.toThrow()
  })

  it('accepts a value of exactly 2000 chars and a key of exactly 100', async () => {
    const key = `RAIDER_SECRET_${'A'.repeat(86)}`
    expect(key).toHaveLength(100)
    expect(await set(key, 'x'.repeat(2000))).toEqual({ keys: [key] })
  })

  it('refuses an existing file over 64 KB and leaves it alone', async () => {
    const big = `# ${'x'.repeat(64 * 1024)}\n`
    await write('.raider/flows/env', big)
    expect(await set('TEST_USER', 'me')).toEqual({ error: 'too-large' })
    expect(await call('list-flow-env-keys')).toEqual({ error: 'too-large' })
    expect(await readEnv()).toBe(big)
  })

  it('refuses a rewrite that would grow past 64 KB', async () => {
    const body = `# ${'x'.repeat(64 * 1024 - 10)}\n`
    await write('.raider/flows/env', body)
    expect(await set('TEST_USER', 'y'.repeat(100))).toEqual({ error: 'too-large' })
    expect(await readEnv()).toBe(body)
  })
})

describe('remove-flow-env', () => {
  it('removes every line of the key and keeps the rest', async () => {
    await write('.raider/flows/env', '# c\nTEST_USER=a\nTEST_PASSWORD=p\nTEST_USER=b\n')
    await fs.chmod(envPath(), 0o600)
    expect(await call('remove-flow-env', { key: 'TEST_USER' })).toEqual({
      keys: ['TEST_PASSWORD']
    })
    expect(await readEnv()).toBe('# c\nTEST_PASSWORD=p\n')
    expect(await mode(envPath())).toBe(0o600)
  })

  it('is a no-op without a file and creates nothing', async () => {
    expect(await call('remove-flow-env', { key: 'TEST_USER' })).toEqual({ keys: [] })
    await expect(fs.lstat(path.join(project, '.raider'))).rejects.toThrow()
  })

  it('refuses a bad key or an extra payload key', async () => {
    expect(await call('remove-flow-env', { key: 'PATH' })).toEqual({ error: 'invalid' })
    expect(await call('remove-flow-env', { key: 'TEST_USER', value: 'x' })).toEqual({
      error: 'invalid'
    })
  })
})

describe('links', () => {
  it('refuses a symlinked env file and leaves its target untouched', async () => {
    await write('decoy', 'TEST_USER=decoy\n')
    await fs.mkdir(path.join(project, '.raider', 'flows'), { recursive: true })
    await fs.symlink(path.join(project, 'decoy'), envPath())
    expect(await set('TEST_USER', SECRET)).toEqual({ error: 'unsafe' })
    expect(await call('list-flow-env-keys')).toEqual({ error: 'unsafe' })
    expect(await call('remove-flow-env', { key: 'TEST_USER' })).toEqual({ error: 'unsafe' })
    expect(await fs.readFile(path.join(project, 'decoy'), 'utf8')).toBe('TEST_USER=decoy\n')
    expect((await fs.lstat(envPath())).isSymbolicLink()).toBe(true)
  })

  it('refuses a symlinked .raider/flows folder', async () => {
    await fs.mkdir(path.join(project, 'elsewhere'))
    await fs.mkdir(path.join(project, '.raider'))
    await fs.symlink(path.join(project, 'elsewhere'), path.join(project, '.raider', 'flows'))
    expect(await set('TEST_USER', SECRET)).toEqual({ error: 'unsafe' })
    expect(await call('list-flow-env-keys')).toEqual({ error: 'unsafe' })
    expect(await fs.readdir(path.join(project, 'elsewhere'))).toEqual([])
  })

  it('refuses a symlinked .raider folder', async () => {
    await fs.mkdir(path.join(project, 'elsewhere'))
    await fs.symlink(path.join(project, 'elsewhere'), path.join(project, '.raider'))
    expect(await set('TEST_USER', SECRET)).toEqual({ error: 'unsafe' })
    expect(await fs.readdir(path.join(project, 'elsewhere'))).toEqual([])
  })

  it('refuses an env that is not a regular file', async () => {
    await fs.mkdir(envPath(), { recursive: true })
    expect(await set('TEST_USER', 'x')).toEqual({ error: 'unsafe' })
    expect(await call('list-flow-env-keys')).toEqual({ error: 'unsafe' })
  })
})

describe('never leaks a value', () => {
  it('logs nothing that contains the value, on success or failure', async () => {
    const spies = (['log', 'warn', 'error', 'info', 'debug'] as const).map((name) =>
      vi.spyOn(console, name).mockImplementation(() => undefined)
    )
    const answers: unknown[] = []
    answers.push(await set('RAIDER_SECRET_API', SECRET))
    answers.push(await set('RAIDER_SECRET_API', `${SECRET} two`))
    answers.push(await call('list-flow-env-keys'))
    answers.push(await set('PATH', SECRET))
    answers.push(await call('set-flow-env', { key: 'TEST_USER', value: SECRET, extra: SECRET }))
    answers.push(await set('TEST_USER', `"${SECRET}'`))
    answers.push(await call('remove-flow-env', { key: 'RAIDER_SECRET_API' }))
    await fs.rm(envPath())
    await write('decoy', '')
    await fs.symlink(path.join(project, 'decoy'), envPath())
    answers.push(await set('TEST_USER', SECRET))
    for (const spy of spies)
      for (const args of spy.mock.calls) expect(JSON.stringify(args)).not.toContain(SECRET)
    expect(JSON.stringify(answers)).not.toContain(SECRET)
  })
})
