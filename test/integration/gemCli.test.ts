// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import path from 'node:path'

vi.mock('electron', () => ({ BrowserWindow: class {}, app: { getPath: (): string => '/' } }))

import {
  gemEnv,
  makeRubyResolver,
  runGemCli,
  type ExecFileFn,
  type GemCliDeps
} from '../../src/main/handlers/gem/gemCli'
import { parseScheduleList } from '../../src/main/handlers/gem/gemJson'
import { scheduleArgs, validateScheduleRequest } from '../../src/shared/schedules'

const RUBY = '/opt/rubies/3.2.8/bin/ruby'
const PROJECT = '/work/my project'
const RBENV = 'eval "$(rbenv init -)" && rbenv shell 3.2.8 && ruby'

type Outcome = { error?: Record<string, unknown> | null; stdout?: string; stderr?: string }

function execDouble(outcome: Outcome = {}): ReturnType<typeof vi.fn> & ExecFileFn {
  return vi.fn((_file, _args, _options, callback) => {
    const error = outcome.error
      ? Object.assign(new Error('Command failed: SECRET'), outcome.error)
      : null
    callback(error as never, outcome.stdout ?? '', outcome.stderr ?? '')
  }) as never
}

const depsWith = (execFile: ExecFileFn, ruby: string | null = RUBY): GemCliDeps => ({
  execFile,
  resolveRuby: vi.fn(async () => ruby)
})

describe('runGemCli', () => {
  // The bridge warns on every failure; keep the test output quiet
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('runs `ruby -S bundle exec raider <args>` with an argv array, --project last, no shell', async () => {
    const execFile = execDouble({ stdout: '[]' })
    await runGemCli(PROJECT, RBENV, ['flow', 'list', '--json'], { json: true }, depsWith(execFile))
    const [file, args, options] = execFile.mock.calls[0]
    expect(file).toBe(RUBY)
    expect(args).toEqual([
      '-S',
      'bundle',
      'exec',
      'raider',
      'flow',
      'list',
      '--json',
      '--project',
      PROJECT
    ])
    expect(options).toMatchObject({
      cwd: PROJECT,
      timeout: 60_000,
      maxBuffer: 1024 * 1024,
      windowsHide: true
    })
    expect(options.shell).toBeUndefined()
  })

  it('passes the schedule argv as single elements, files after NAME, then --project', async () => {
    const execFile = execDouble({ stdout: 'Scheduled report' })
    const req = validateScheduleRequest({
      name: 'report',
      every: 'day',
      at: '09:00',
      retries: 0,
      notify: false,
      showBrowser: false,
      selection: { kind: 'files', files: ['spec/a b_spec.rb'] }
    })
    await runGemCli(PROJECT, RBENV, scheduleArgs(req), {}, depsWith(execFile))
    const args: string[] = execFile.mock.calls[0][1]
    expect(args).toEqual([
      '-S',
      'bundle',
      'exec',
      'raider',
      'schedule',
      'add',
      'report',
      'spec/a b_spec.rb',
      '--every',
      'day',
      '--at',
      '09:00',
      '--retries',
      '0',
      '--no-notify',
      '--project',
      PROJECT
    ])
  })

  it('passes a hostile argument as one argv element, never through a shell', async () => {
    const execFile = execDouble()
    const hostile = `x'; rm -rf ~; echo "$(id)" \`id\` | cat > /tmp/p && \n--project /etc`
    await runGemCli(PROJECT, RBENV, ['flow', 'unschedule', hostile], {}, depsWith(execFile))
    const [file, args, options] = execFile.mock.calls[0]
    expect(file).toBe(RUBY)
    expect(args).toEqual([
      '-S',
      'bundle',
      'exec',
      'raider',
      'flow',
      'unschedule',
      hostile,
      '--project',
      PROJECT
    ])
    expect(options.shell).toBeUndefined()
  })

  it('returns stdout and parsed JSON on exit 0', async () => {
    const execFile = execDouble({ stdout: ' [1] \n' })
    expect(
      await runGemCli(
        PROJECT,
        RBENV,
        ['flow', 'list', '--json'],
        { json: true },
        depsWith(execFile)
      )
    ).toEqual({
      ok: true,
      stdout: ' [1] \n',
      stderr: '',
      json: [1]
    })
  })

  it('hands a successful command its stderr', async () => {
    const execFile = execDouble({ stdout: 'Removed x\n', stderr: 'Removed 1 schedule made…\n' })
    expect(
      await runGemCli(PROJECT, RBENV, ['schedule', 'remove', 'x'], {}, depsWith(execFile))
    ).toEqual({ ok: true, stdout: 'Removed x\n', stderr: 'Removed 1 schedule made…\n' })
  })

  it('reports gem-output for stdout that is not JSON', async () => {
    const execFile = execDouble({ stdout: 'Bundler says hi' })
    expect(
      await runGemCli(
        PROJECT,
        RBENV,
        ['flow', 'list', '--json'],
        { json: true },
        depsWith(execFile)
      )
    ).toEqual({
      ok: false,
      error: 'gem-output'
    })
  })

  it('reports a refusal with the last stderr line, without leaking the command', async () => {
    const execFile = execDouble({
      error: { code: 2 },
      stderr: 'warning: something\nUnknown flow: nope\u001b[0m\n\n'
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await runGemCli(
      PROJECT,
      RBENV,
      ['flow', 'unschedule', 'nope'],
      {},
      depsWith(execFile)
    )
    expect(result).toEqual({
      ok: false,
      error: 'refused',
      message: 'Unknown flow: nope[0m',
      exitCode: 2,
      stderr: 'warning: something\nUnknown flow: nope\u001b[0m\n\n'
    })
    expect(JSON.stringify(warn.mock.calls)).not.toContain('SECRET')
    warn.mockRestore()
  })

  it('caps the refusal message at 500 characters', async () => {
    const execFile = execDouble({ error: { code: 2 }, stderr: 'x'.repeat(900) })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await runGemCli(PROJECT, RBENV, ['flow', 'init'], {}, depsWith(execFile))
    expect(result.ok === false && result.message).toHaveLength(500)
  })

  it('never logs the arguments after the command name', async () => {
    const execFile = execDouble({ error: { code: 2 }, stderr: 'bad' })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await runGemCli(
      PROJECT,
      RBENV,
      ['flow', 'schedule', 'r', '--note', 'pw=hunter2'],
      {},
      depsWith(execFile)
    )
    expect(JSON.stringify([warn.mock.calls, log.mock.calls])).not.toContain('hunter2')
    warn.mockRestore()
    log.mockRestore()
  })

  it('reports a timeout when the child was killed', async () => {
    const execFile = execDouble({ error: { killed: true, signal: 'SIGTERM', code: null } })
    expect(await runGemCli(PROJECT, RBENV, ['flow', 'init'], {}, depsWith(execFile))).toEqual({
      ok: false,
      error: 'timeout'
    })
  })

  it('reports gem-output when stdout exceeds the buffer', async () => {
    const execFile = execDouble({
      error: { code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER', killed: true, signal: 'SIGTERM' }
    })
    expect(
      await runGemCli(
        PROJECT,
        RBENV,
        ['flow', 'list', '--json'],
        { json: true },
        depsWith(execFile)
      )
    ).toEqual({
      ok: false,
      error: 'gem-output'
    })
  })

  it('reports ruby when the ruby cannot be resolved or started', async () => {
    const execFile = execDouble()
    expect(await runGemCli(PROJECT, RBENV, ['flow', 'init'], {}, depsWith(execFile, null))).toEqual(
      {
        ok: false,
        error: 'ruby'
      }
    )
    expect(execFile).not.toHaveBeenCalled()
    const missing = execDouble({ error: { code: 'ENOENT' } })
    expect(await runGemCli(PROJECT, RBENV, ['flow', 'init'], {}, depsWith(missing))).toEqual({
      ok: false,
      error: 'ruby'
    })
  })
})

describe('gemEnv', () => {
  const base: NodeJS.ProcessEnv = {
    PATH: ['/usr/bin', '/app/node_modules/.bin', '/bin'].join(path.delimiter),
    GEM_HOME: '/gems',
    GEM_PATH: '/gems:/more',
    RUBYOPT: '-W0',
    BUNDLE_GEMFILE: '/elsewhere/Gemfile',
    HOME: '/home/me'
  }

  it('puts the ruby dir first and strips node_modules/.bin', () => {
    const env = gemEnv(RUBY, base)
    expect(env.PATH).toBe(['/opt/rubies/3.2.8/bin', '/usr/bin', '/bin'].join(path.delimiter))
  })

  it('drops BUNDLE_GEMFILE, keeps gem paths', () => {
    const env = gemEnv(RUBY, base)
    expect(env.BUNDLE_GEMFILE).toBeUndefined()
    expect(env).toMatchObject({
      GEM_HOME: '/gems',
      GEM_PATH: '/gems:/more',
      RUBYOPT: '-W0',
      HOME: '/home/me'
    })
  })

  it('falls back to a UTF-8 LANG', () => {
    expect(gemEnv(RUBY, base).LANG).toBe('en_US.UTF-8')
    expect(gemEnv(RUBY, { ...base, LANG: 'de_DE.UTF-8' }).LANG).toBe('de_DE.UTF-8')
  })

  it('is what runGemCli passes', async () => {
    const execFile = execDouble()
    process.env.BUNDLE_GEMFILE = '/elsewhere/Gemfile'
    await runGemCli(PROJECT, RBENV, ['schedule', 'list'], {}, depsWith(execFile))
    delete process.env.BUNDLE_GEMFILE
    const env = execFile.mock.calls[0][2].env
    expect(env.BUNDLE_GEMFILE).toBeUndefined()
    expect(env.PATH.startsWith('/opt/rubies/3.2.8/bin')).toBe(true)
  })
})

describe('makeRubyResolver', () => {
  const file = { isFile: (): boolean => true }
  let exec: ReturnType<typeof vi.fn>
  let stat: ReturnType<typeof vi.fn>

  beforeEach(() => {
    exec = vi.fn(async () => ({ stdout: RUBY, stderr: '', exitCode: 0 }))
    stat = vi.fn(async () => file)
  })

  it('runs a constant shell string with a timeout and caches the answer', async () => {
    const resolve = makeRubyResolver({ exec, stat })
    expect(await resolve(PROJECT, RBENV)).toBe(RUBY)
    expect(await resolve(PROJECT, RBENV)).toBe(RUBY)
    expect(exec).toHaveBeenCalledTimes(1)
    const [command, options] = exec.mock.calls[0]
    expect(command).toContain(`${RBENV} -e 'print RbConfig.ruby'`)
    expect(command).toContain(`cd '${PROJECT}'`)
    expect(options.timeout).toBe(20_000)
  })

  it('refuses a ruby command it did not produce, without running anything', async () => {
    const resolve = makeRubyResolver({ exec, stat })
    expect(await resolve(PROJECT, 'ruby; rm -rf ~')).toBeNull()
    expect(await resolve(PROJECT, '$(touch x) ruby')).toBeNull()
    expect(exec).not.toHaveBeenCalled()
  })

  it.each([
    ['a relative path', 'ruby'],
    ['a trailing newline', `${RUBY}\n`],
    ['two lines', `${RUBY}\n/bin/sh`],
    ['a NUL', `${RUBY}\u0000`],
    ['nothing', '']
  ])('refuses %s as the answer', async (_label, stdout) => {
    exec.mockResolvedValue({ stdout, stderr: '', exitCode: 0 })
    expect(await makeRubyResolver({ exec, stat })(PROJECT, RBENV)).toBeNull()
  })

  it('refuses a failed command, a missing file or a non-file, and does not cache failures', async () => {
    exec.mockResolvedValueOnce({ stdout: '', stderr: 'rbenv: no such version', exitCode: 1 })
    const resolve = makeRubyResolver({ exec, stat })
    expect(await resolve(PROJECT, RBENV)).toBeNull()
    expect(await resolve(PROJECT, RBENV)).toBe(RUBY)
    stat.mockRejectedValueOnce(Object.assign(new Error('nope'), { code: 'ENOENT' }))
    expect(await makeRubyResolver({ exec, stat })(PROJECT, RBENV)).toBeNull()
    stat.mockResolvedValueOnce({ isFile: () => false })
    expect(await makeRubyResolver({ exec, stat })(PROJECT, RBENV)).toBeNull()
  })
})

describe('parseScheduleList', () => {
  // The shape `raider schedule list --json` prints in 4.2.0 (checked against the real gem)
  const row = {
    name: 'nightly',
    every: 'weekday',
    at: '08:00',
    on: null,
    retries: 1,
    notify: false,
    show_browser: true,
    selection: { kind: 'files', files: ['spec/login_spec.rb'] },
    next_run_at: '2026-11-13T08:00:00+01:00',
    os_state: 'ok',
    last: {
      status: 'failed',
      finished_at: '2026-11-12T08:01:10+01:00',
      trigger: 'schedule',
      counts: { total: 4, passed: 3, failed: 1, skipped: 0 }
    }
  }
  const orphan = {
    name: 'lost',
    every: null,
    at: null,
    on: null,
    retries: null,
    notify: null,
    show_browser: null,
    selection: null,
    next_run_at: null,
    os_state: 'missing from schedules.yml',
    last: null
  }

  it('maps a listed row to camelCase', () => {
    expect(parseScheduleList({ notice: null, schedules: [row] })).toEqual({
      notice: null,
      schedules: [
        {
          name: 'nightly',
          every: 'weekday',
          at: '08:00',
          on: null,
          retries: 1,
          notify: false,
          showBrowser: true,
          selection: { kind: 'files', files: ['spec/login_spec.rb'] },
          nextRunAt: '2026-11-13T08:00:00+01:00',
          osState: 'ok',
          last: {
            status: 'failed',
            finishedAt: '2026-11-12T08:01:10+01:00',
            trigger: 'schedule',
            counts: { total: 4, passed: 3, failed: 1, skipped: 0 }
          }
        }
      ]
    })
  })

  it('keeps an OS-only row as an orphan and the notice as one plain line', () => {
    expect(
      parseScheduleList({ notice: 'Removed 1 schedule\u001b made…', schedules: [orphan] })
    ).toEqual({
      notice: 'Removed 1 schedule made…',
      schedules: [{ name: 'lost', orphan: true, osState: 'missing from schedules.yml', last: null }]
    })
  })

  it('keeps tag and all selections and a weekly day', () => {
    const tag = { ...row, every: 'week', on: 'fri', selection: { kind: 'tag', tag: 'smoke' } }
    const all = { ...row, name: 'all_of_them', selection: { kind: 'all' } }
    const parsed = parseScheduleList({ notice: null, schedules: [tag, all] })
    expect(parsed?.schedules.map((s) => (s.orphan ? null : [s.on, s.selection]))).toEqual([
      ['fri', { kind: 'tag', tag: 'smoke' }],
      [null, { kind: 'all' }]
    ])
  })

  it('strips control characters from os_state and bounds it', () => {
    const parsed = parseScheduleList({
      notice: null,
      schedules: [{ ...row, os_state: 'unknown (\u001b[31mboom\n)' + 'x'.repeat(5000) }]
    })
    const osState = parsed?.schedules[0].osState ?? ''
    expect(osState.startsWith('unknown ([31mboom)')).toBe(true)
    expect(osState.length).toBe(1000)
  })

  it.each([
    ['a list', [row]],
    ['null', null],
    ['a string', 'x'],
    ['no schedules', { notice: null }],
    ['schedules not a list', { notice: null, schedules: {} }],
    ['notice a number', { notice: 3, schedules: [] }],
    ['no notice', { schedules: [] }]
  ])('refuses a root that is %s', (_label, value) => {
    expect(parseScheduleList(value)).toBeNull()
  })

  it.each([
    ['null', null],
    ['a string', 'nightly'],
    ['a bad name', { ...row, name: '../x' }],
    ['retries 4', { ...row, retries: 4 }],
    ['retries as a string', { ...row, retries: '1' }],
    ['notify as a string', { ...row, notify: 'false' }],
    ['show_browser missing', { ...row, show_browser: undefined }],
    ['at 8:00', { ...row, at: '8:00' }],
    ['every month', { ...row, every: 'month' }],
    ['a day on a daily rule', { ...row, every: 'day', on: 'mon' }],
    ['a hostile tag', { ...row, selection: { kind: 'tag', tag: '--project' } }],
    [
      'a file out of the project',
      { ...row, selection: { kind: 'files', files: ['../a_spec.rb'] } }
    ],
    ['an absolute file', { ...row, selection: { kind: 'files', files: ['/a_spec.rb'] } }],
    [
      'tag and files together',
      { ...row, selection: { kind: 'tag', tag: 'a', files: ['spec/a_spec.rb'] } }
    ],
    [
      '201 files',
      {
        ...row,
        selection: {
          kind: 'files',
          files: Array.from({ length: 201 }, (_, i) => `spec/t${i}_spec.rb`)
        }
      }
    ],
    ['os_state missing', { ...row, os_state: null }],
    ['next_run_at a number', { ...row, next_run_at: 3 }],
    ['an orphan without os_state', { ...orphan, os_state: 1 }]
  ])('drops a row that is %s', (_label, bad) => {
    expect(parseScheduleList({ notice: null, schedules: [bad, row] })?.schedules).toHaveLength(1)
  })

  it.each([
    ['an unknown status', { status: 'completed' }],
    ['an unknown trigger', { trigger: 'desktop' }],
    ['no counts', { counts: undefined }],
    ['a negative count', { counts: { total: -1, passed: 0, failed: 0, skipped: 0 } }],
    ['no finished_at', { finished_at: undefined }]
  ])('makes a last run with %s null', (_label, patch) => {
    const parsed = parseScheduleList({
      notice: null,
      schedules: [{ ...row, last: { ...row.last, ...patch } }]
    })
    expect(parsed?.schedules[0].last).toBeNull()
  })
})
