// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import path from 'node:path'

vi.mock('electron', () => ({ BrowserWindow: class {}, app: { getPath: (): string => '/' } }))

import {
  flowEnv,
  makeRubyResolver,
  runFlowCli,
  type ExecFileFn,
  type FlowCliDeps
} from '../../src/main/handlers/flows/flowCli'
import { parseGemFlows, parseGemSchedules } from '../../src/main/handlers/flows/gemJson'
import { scheduleArgs, validateSchedule } from '../../src/shared/flows'

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

const depsWith = (execFile: ExecFileFn, ruby: string | null = RUBY): FlowCliDeps => ({
  execFile,
  resolveRuby: vi.fn(async () => ruby)
})

describe('runFlowCli', () => {
  // The bridge warns on every failure; keep the test output quiet
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('runs `ruby -S bundle exec raider flow` with an argv array, --project last, no shell', async () => {
    const execFile = execDouble({ stdout: '[]' })
    await runFlowCli(PROJECT, RBENV, ['list', '--json'], { json: true }, depsWith(execFile))
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

  it('passes hostile input values as single argv elements, inputs before --project', async () => {
    const execFile = execDouble({ stdout: 'Scheduled report' })
    const schedule = validateSchedule({
      every: 'day',
      at: '09:00',
      retries: 0,
      notify: false,
      inputs: { cmd: '$(rm -rf ~)', semi: 'a; rm -rf /' }
    })
    await runFlowCli(PROJECT, RBENV, scheduleArgs('report', schedule), {}, depsWith(execFile))
    const args: string[] = execFile.mock.calls[0][1]
    expect(args).toContain('cmd=$(rm -rf ~)')
    expect(args).toContain('semi=a; rm -rf /')
    expect(args.slice(-6)).toEqual([
      '--input',
      'cmd=$(rm -rf ~)',
      '--input',
      'semi=a; rm -rf /',
      '--project',
      PROJECT
    ])
  })

  it('returns stdout and parsed JSON on exit 0', async () => {
    const execFile = execDouble({ stdout: ' [1] \n' })
    expect(
      await runFlowCli(PROJECT, RBENV, ['list', '--json'], { json: true }, depsWith(execFile))
    ).toEqual({
      ok: true,
      stdout: ' [1] \n',
      json: [1]
    })
  })

  it('reports gem-output for stdout that is not JSON', async () => {
    const execFile = execDouble({ stdout: 'Bundler says hi' })
    expect(
      await runFlowCli(PROJECT, RBENV, ['list', '--json'], { json: true }, depsWith(execFile))
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
    const result = await runFlowCli(PROJECT, RBENV, ['unschedule', 'nope'], {}, depsWith(execFile))
    expect(result).toEqual({
      ok: false,
      error: 'refused',
      message: 'Unknown flow: nope[0m',
      exitCode: 2
    })
    expect(JSON.stringify(warn.mock.calls)).not.toContain('SECRET')
    warn.mockRestore()
  })

  it('caps the refusal message at 500 characters', async () => {
    const execFile = execDouble({ error: { code: 2 }, stderr: 'x'.repeat(900) })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await runFlowCli(PROJECT, RBENV, ['init'], {}, depsWith(execFile))
    expect(result.ok === false && result.message).toHaveLength(500)
  })

  it('never logs the arguments (schedule inputs)', async () => {
    const execFile = execDouble({ error: { code: 2 }, stderr: 'bad' })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await runFlowCli(
      PROJECT,
      RBENV,
      ['schedule', 'r', '--input', 'pw=hunter2'],
      {},
      depsWith(execFile)
    )
    expect(JSON.stringify([warn.mock.calls, log.mock.calls])).not.toContain('hunter2')
    warn.mockRestore()
    log.mockRestore()
  })

  it('reports a timeout when the child was killed', async () => {
    const execFile = execDouble({ error: { killed: true, signal: 'SIGTERM', code: null } })
    expect(await runFlowCli(PROJECT, RBENV, ['init'], {}, depsWith(execFile))).toEqual({
      ok: false,
      error: 'timeout'
    })
  })

  it('reports gem-output when stdout exceeds the buffer', async () => {
    const execFile = execDouble({
      error: { code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER', killed: true, signal: 'SIGTERM' }
    })
    expect(
      await runFlowCli(PROJECT, RBENV, ['list', '--json'], { json: true }, depsWith(execFile))
    ).toEqual({
      ok: false,
      error: 'gem-output'
    })
  })

  it('reports ruby when the ruby cannot be resolved or started', async () => {
    const execFile = execDouble()
    expect(await runFlowCli(PROJECT, RBENV, ['init'], {}, depsWith(execFile, null))).toEqual({
      ok: false,
      error: 'ruby'
    })
    expect(execFile).not.toHaveBeenCalled()
    const missing = execDouble({ error: { code: 'ENOENT' } })
    expect(await runFlowCli(PROJECT, RBENV, ['init'], {}, depsWith(missing))).toEqual({
      ok: false,
      error: 'ruby'
    })
  })
})

describe('flowEnv', () => {
  const base: NodeJS.ProcessEnv = {
    PATH: ['/usr/bin', '/app/node_modules/.bin', '/bin'].join(path.delimiter),
    GEM_HOME: '/gems',
    GEM_PATH: '/gems:/more',
    RUBYOPT: '-W0',
    BUNDLE_GEMFILE: '/elsewhere/Gemfile',
    RAIDER_INPUT_HOURS: '5',
    RAIDER_FLOW_TRIGGER: 'schedule',
    HOME: '/home/me'
  }

  it('puts the ruby dir first and strips node_modules/.bin', () => {
    const env = flowEnv(RUBY, base)
    expect(env.PATH).toBe(['/opt/rubies/3.2.8/bin', '/usr/bin', '/bin'].join(path.delimiter))
  })

  it('drops inherited RAIDER_INPUT_* / RAIDER_FLOW_* and BUNDLE_GEMFILE, keeps gem paths', () => {
    const env = flowEnv(RUBY, base)
    expect(env.RAIDER_INPUT_HOURS).toBeUndefined()
    expect(env.RAIDER_FLOW_TRIGGER).toBeUndefined()
    expect(env.BUNDLE_GEMFILE).toBeUndefined()
    expect(env).toMatchObject({
      GEM_HOME: '/gems',
      GEM_PATH: '/gems:/more',
      RUBYOPT: '-W0',
      HOME: '/home/me'
    })
  })

  it('falls back to a UTF-8 LANG', () => {
    expect(flowEnv(RUBY, base).LANG).toBe('en_US.UTF-8')
    expect(flowEnv(RUBY, { ...base, LANG: 'de_DE.UTF-8' }).LANG).toBe('de_DE.UTF-8')
  })

  it('is what runFlowCli passes', async () => {
    const execFile = execDouble()
    process.env.RAIDER_INPUT_LEAK = 'x'
    await runFlowCli(PROJECT, RBENV, ['init'], {}, depsWith(execFile))
    delete process.env.RAIDER_INPUT_LEAK
    const env = execFile.mock.calls[0][2].env
    expect(env.RAIDER_INPUT_LEAK).toBeUndefined()
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

describe('parseGemFlows', () => {
  const real = JSON.parse(
    '[{"name":"broken","file":"flows/broken_flow.rb","last":{"status":"failed","finished_at":"2026-11-10T11:09:19.448Z","failed_step":{"title":"runs","line":7},"results_dir":"flow-results/broken/20261110T110917Z"}},{"name":"hello","file":"flows/hello_flow.rb","last":null}]'
  )

  it('maps the real 4.1.0 shape to camelCase', () => {
    expect(parseGemFlows(real)).toEqual([
      {
        name: 'broken',
        file: 'flows/broken_flow.rb',
        last: {
          status: 'failed',
          finishedAt: '2026-11-10T11:09:19.448Z',
          failedStep: { title: 'runs', line: 7 },
          resultsDir: 'flow-results/broken/20261110T110917Z'
        }
      },
      { name: 'hello', file: 'flows/hello_flow.rb', last: null }
    ])
  })

  it('keeps a failed step number and a null failed step', () => {
    const last = { ...real[0].last, failed_step: { number: 3, title: 't', line: 2 } }
    expect(parseGemFlows([{ ...real[0], last }])?.[0].last?.failedStep).toEqual({
      number: 3,
      title: 't',
      line: 2
    })
    const none = { ...real[0].last, failed_step: null, status: 'completed' }
    expect(parseGemFlows([{ ...real[0], last: none }])?.[0].last?.failedStep).toBeNull()
  })

  it('returns null for a non-array', () => {
    expect(parseGemFlows({ flows: [] })).toBeNull()
    expect(parseGemFlows('x')).toBeNull()
  })

  it('drops hostile entries', () => {
    expect(
      parseGemFlows([
        { name: '../etc', file: 'flows/../etc_flow.rb', last: null },
        { name: 'env', file: 'flows/env_flow.rb', last: null },
        { name: 'x', file: '/etc/passwd', last: null },
        { name: 5, file: 'flows/5_flow.rb', last: null },
        null,
        'hello'
      ])
    ).toEqual([])
  })

  it.each([
    ['a ../ results dir', { results_dir: 'flow-results/broken/../../etc' }],
    ['another flow’s results dir', { results_dir: 'flow-results/hello/20261110T110917Z' }],
    ['an unknown status', { status: 'exploded' }],
    ['a huge string', { finished_at: 'x'.repeat(1001) }],
    ['a float line', { failed_step: { title: 'a', line: 1.5 } }],
    ['a string line', { failed_step: { title: 'a', line: '7' } }],
    ['an unknown trigger', { trigger: 'cron' }]
  ])('nulls the last run for %s', (_label, patch) => {
    const last = { ...real[0].last, ...patch }
    expect(parseGemFlows([{ ...real[0], last }])?.[0].last).toBeNull()
  })

  it('accepts a numbered results dir', () => {
    const last = { ...real[0].last, results_dir: 'flow-results/broken/20261110T110917Z-2' }
    expect(parseGemFlows([{ ...real[0], last }])?.[0].last?.resultsDir).toBe(
      'flow-results/broken/20261110T110917Z-2'
    )
  })
})

describe('parseGemSchedules', () => {
  const real = JSON.parse(
    '[{"name":"broken","every":"hour","at":"00:07","on":null,"retries":0,"inputs":["hours=5"],"notify":true,"next_run_at":"2026-11-10T13:07:00+01:00","os_state":"ok","last":{"status":"failed","finished_at":"2026-11-10T11:09:19.448Z","trigger":"manual","failed_step":{"title":"runs","line":7},"results_dir":"flow-results/broken/20261110T110917Z"}}]'
  )

  it('maps the real 4.1.0 shape, inputs to a record', () => {
    expect(parseGemSchedules(real)).toEqual([
      {
        name: 'broken',
        every: 'hour',
        at: '00:07',
        on: null,
        retries: 0,
        inputs: { hours: '5' },
        notify: true,
        nextRunAt: '2026-11-10T13:07:00+01:00',
        osState: 'ok',
        last: {
          status: 'failed',
          finishedAt: '2026-11-10T11:09:19.448Z',
          trigger: 'manual',
          failedStep: { title: 'runs', line: 7 },
          resultsDir: 'flow-results/broken/20261110T110917Z'
        }
      }
    ])
  })

  it('splits an input at the first =', () => {
    const [s] = parseGemSchedules([{ ...real[0], inputs: ['q=a=b', 'empty='] }]) ?? []
    expect(s.inputs).toEqual({ q: 'a=b', empty: '' })
  })

  it('strips control characters from os_state and bounds it', () => {
    const [s] =
      parseGemSchedules([{ ...real[0], os_state: 'loaded\u001b[31m\n' + 'x'.repeat(2000) }]) ?? []
    expect([...s.osState].some((c) => c.charCodeAt(0) < 0x20)).toBe(false)
    expect(s.osState.length).toBeLessThanOrEqual(1000)
  })

  it('keeps a weekly day and a null next run', () => {
    const [s] =
      parseGemSchedules([
        { ...real[0], every: 'week', at: '09:00', on: 'mon', next_run_at: null }
      ]) ?? []
    expect(s).toMatchObject({ every: 'week', on: 'mon', nextRunAt: null })
  })

  it.each([
    ['a bad name', { name: 'Bad Name' }],
    ['an unknown every', { every: 'month' }],
    ['a bad at', { at: '25:00' }],
    ['a bad day', { on: 'monday' }],
    ['a float retries', { retries: 0.5 }],
    ['an infinite retries', { retries: Number.POSITIVE_INFINITY }],
    ['inputs as an object', { inputs: { hours: '5' } }],
    ['an input without =', { inputs: ['hours'] }],
    ['a __proto__ input', { inputs: ['__proto__=x'] }],
    ['notify as a string', { notify: 'true' }],
    ['a huge next run', { next_run_at: 'x'.repeat(1001) }]
  ])('drops an entry with %s', (_label, patch) => {
    expect(parseGemSchedules([{ ...real[0], ...patch }])).toEqual([])
  })

  // gem 4.1.0, `flow schedules --json` after the entry was removed from schedules.yml by hand
  // while launchd still had the job (captured 2026-11-10)
  const orphan = JSON.parse(
    '[{"name":"hello","every":null,"at":null,"on":null,"retries":null,"inputs":null,"notify":null,"next_run_at":null,"os_state":"missing from schedules.yml","last":{"status":"completed","finished_at":"2026-11-10T11:09:20.475Z","trigger":"manual","failed_step":null,"results_dir":"flow-results/hello/20261110T110919Z"}}]'
  )

  it('keeps a schedule the OS runs but schedules.yml lost, as an orphan', () => {
    expect(parseGemSchedules(orphan)).toEqual([
      {
        name: 'hello',
        orphan: true,
        osState: 'missing from schedules.yml',
        last: {
          status: 'completed',
          finishedAt: '2026-11-10T11:09:20.475Z',
          trigger: 'manual',
          failedStep: null,
          resultsDir: 'flow-results/hello/20261110T110919Z'
        }
      }
    ])
  })

  it.each([
    ['a bad name', { name: 'Bad Name' }],
    ['no os_state', { os_state: null }],
    ['one rule field set', { every: 'day' }],
    ['retries set', { retries: 0 }]
  ])('drops an orphan with %s', (_label, patch) => {
    expect(parseGemSchedules([{ ...orphan[0], ...patch }])).toEqual([])
  })

  it('returns null for a non-array', () => {
    expect(parseGemSchedules(null)).toBeNull()
  })
})
