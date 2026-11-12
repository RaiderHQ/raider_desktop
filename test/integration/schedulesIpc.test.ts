// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

vi.mock('electron', () => ({
  BrowserWindow: class {},
  app: { getPath: (): string => '/' },
  shell: { openPath: vi.fn(async () => '') }
}))

import { appState } from '../../src/main/handlers/appState'
import {
  listSchedules,
  registerSchedulesIpc,
  type SchedulesIpcDeps
} from '../../src/main/handlers/schedules/schedulesIpc'
import { listedFiles } from '../../src/main/handlers/tests/projectTestIpc'
import type { ProjectLayout } from '../../src/shared/types/projectLayout'

const MAIN_ID = 7
const RUBY = 'ruby'
const LAYOUT: ProjectLayout = {
  framework: 'rspec',
  automation: 'selenium',
  specPath: 'spec',
  featurePath: 'features',
  helperPath: 'helpers',
  recordable: true
}
const LOCK = (v: string): string => `GEM\n  specs:\n    ruby_raider (${v})\n      thor\n`
const REQUEST = {
  name: 'nightly',
  every: 'day',
  at: '09:30',
  retries: 0,
  notify: false,
  showBrowser: false,
  selection: { kind: 'all' }
}
const ROW = {
  name: 'nightly',
  every: 'day',
  at: '09:30',
  on: null,
  retries: 0,
  notify: false,
  show_browser: false,
  selection: { kind: 'all' },
  next_run_at: '2026-11-13T09:30:00+01:00',
  os_state: 'ok',
  last: {
    status: 'passed',
    finished_at: '2026-11-12T09:31:00+01:00',
    trigger: 'schedule',
    counts: { total: 2, passed: 2, failed: 0, skipped: 0 }
  }
}

type Handler = (event: unknown, ...args: unknown[]) => Promise<unknown>

let project: string
let handlers: Map<string, Handler>
let deps: SchedulesIpcDeps & {
  runGemCli: ReturnType<typeof vi.fn>
  openPath: ReturnType<typeof vi.fn>
}

const main = { sender: { id: MAIN_ID } }
const call = (channel: string, ...args: unknown[]): Promise<unknown> =>
  handlers.get(channel)!(main, ...args)
const gemArgs = (n = 0): string[] => deps.runGemCli.mock.calls[n][2]

async function write(rel: string, body = ''): Promise<void> {
  await fs.mkdir(path.dirname(path.join(project, rel)), { recursive: true })
  await fs.writeFile(path.join(project, rel), body)
}

function register(patch: Partial<SchedulesIpcDeps> = {}): void {
  handlers = new Map()
  const ipcMain = {
    handle: (channel: string, fn: Handler): void => {
      handlers.set(channel, fn)
    }
  }
  registerSchedulesIpc(ipcMain as never, { ...deps, ...patch })
}

beforeEach(async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  project = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'schedules-ipc-')))
  await write('Gemfile.lock', LOCK('4.2.0'))
  await write('spec/login_spec.rb', "describe 'Login' do\n  it 'works' do\n  end\nend\n")
  await write('spec/cart_spec.rb', "describe 'Cart' do\n  it 'adds' do\n  end\nend\n")
  appState.mainWindow = { webContents: { id: MAIN_ID } } as never
  appState.projectPath = project
  appState.layout = { ...LAYOUT }
  deps = {
    runGemCli: vi.fn(async () => ({ ok: true, stdout: '', stderr: '' })),
    listedFiles: (files) => listedFiles(files),
    openPath: vi.fn(async () => ''),
    platform: 'darwin'
  } as typeof deps
  register()
})

afterEach(async () => {
  vi.restoreAllMocks()
  appState.mainWindow = null
  appState.projectPath = null
  appState.layout = null
  await fs.rm(project, { recursive: true, force: true })
})

describe('sender check', () => {
  it.each([
    ['schedules-status', []],
    ['list-schedules', [RUBY]],
    ['add-schedule', [RUBY, REQUEST]],
    ['remove-schedule', [RUBY, 'nightly']],
    ['open-schedule-report', ['nightly']]
  ])('%s refuses any other sender and runs nothing', async (channel, args) => {
    await write('raider-results/index.html', '<html>')
    const result = await handlers.get(channel)!({ sender: { id: 99 } }, ...args)
    expect(result).toEqual({ error: 'invalid' })
    expect(deps.runGemCli).not.toHaveBeenCalled()
    expect(deps.openPath).not.toHaveBeenCalled()
  })
})

describe('schedules-status', () => {
  it('reads the lock and the 4.1 schedules file, never the gem', async () => {
    expect(await call('schedules-status')).toEqual({
      supported: true,
      version: '4.2.0',
      oldSchedules: false,
      platform: 'darwin'
    })
    await write('.raider/flows/schedules.yml', 'schedules: []\n')
    await write('Gemfile.lock', LOCK('4.1.3'))
    expect(await call('schedules-status')).toMatchObject({
      supported: false,
      version: '4.1.3',
      oldSchedules: true
    })
    expect(deps.runGemCli).not.toHaveBeenCalled()
  })

  it('counts an unknown version as unsupported and a linked schedules.yml as none', async () => {
    await fs.rm(path.join(project, 'Gemfile.lock'))
    await write('elsewhere.yml')
    await fs.mkdir(path.join(project, '.raider', 'flows'), { recursive: true })
    await fs.symlink(
      path.join(project, 'elsewhere.yml'),
      path.join(project, '.raider/flows/schedules.yml')
    )
    expect(await call('schedules-status')).toMatchObject({
      supported: false,
      version: null,
      oldSchedules: false
    })
  })

  it('answers no-project without one', async () => {
    appState.projectPath = null
    expect(await call('schedules-status')).toEqual({ error: 'no-project' })
  })
})

describe('gate', () => {
  it.each([
    ['list-schedules', [RUBY]],
    ['add-schedule', [RUBY, REQUEST]],
    ['remove-schedule', [RUBY, 'nightly']]
  ])('%s needs 4.2 in the lock and a valid ruby command', async (channel, args) => {
    await write('Gemfile.lock', LOCK('4.1.9'))
    expect(await call(channel, ...args)).toEqual({ error: 'needs42' })
    await fs.rm(path.join(project, 'Gemfile.lock'))
    expect(await call(channel, ...args)).toEqual({ error: 'needs42' })
    await write('Gemfile.lock', LOCK('4.2.0'))
    expect(await call(channel, 'ruby; rm -rf ~', ...args.slice(1))).toMatchObject({
      error: 'invalid'
    })
    appState.projectPath = null
    expect(await call(channel, ...args)).toEqual({ error: 'no-project' })
    expect(deps.runGemCli).not.toHaveBeenCalled()
  })
})

describe('list-schedules', () => {
  it('runs `schedule list --json` on the active project and parses it', async () => {
    deps.runGemCli.mockResolvedValue({
      ok: true,
      stdout: '',
      stderr: '',
      json: { notice: 'Removed 1 schedule made with Ruby Raider 4.1 (old)', schedules: [ROW] }
    })
    const result = (await call('list-schedules', RUBY)) as Record<string, unknown>
    expect(deps.runGemCli).toHaveBeenCalledWith(project, RUBY, ['schedule', 'list', '--json'], {
      json: true
    })
    expect(result.notice).toBe('Removed 1 schedule made with Ruby Raider 4.1 (old)')
    expect(result.schedules).toEqual([
      expect.objectContaining({
        name: 'nightly',
        showBrowser: false,
        selection: { kind: 'all' },
        last: expect.objectContaining({ status: 'passed' })
      })
    ])
  })

  it("takes the last run from the log's last line, busy included (R1)", async () => {
    deps.runGemCli.mockResolvedValue({
      ok: true,
      stdout: '',
      stderr: '',
      json: { notice: null, schedules: [ROW] }
    })
    const busy = {
      run_id: '0123456789abcdef',
      started_at: '2026-11-12T10:00:00+01:00',
      finished_at: '2026-11-12T10:00:01+01:00',
      status: 'busy',
      counts: { total: 0, passed: 0, failed: 0, skipped: 0 },
      trigger: 'manual',
      results_dir: 'raider-results'
    }
    await write('.raider/schedules/nightly/runs.jsonl', `${JSON.stringify(busy)}\n`)
    const result = (await call('list-schedules', RUBY)) as { schedules: { last: unknown }[] }
    expect(result.schedules[0].last).toEqual({
      status: 'busy',
      finishedAt: '2026-11-12T10:00:01+01:00',
      trigger: 'manual',
      counts: { total: 0, passed: 0, failed: 0, skipped: 0 }
    })
  })

  it('falls back to the gem last when the log line does not fit', async () => {
    deps.runGemCli.mockResolvedValue({
      ok: true,
      stdout: '',
      stderr: '',
      json: { notice: null, schedules: [ROW] }
    })
    await write('.raider/schedules/nightly/runs.jsonl', '{"status":"completed"}\n')
    const result = (await call('list-schedules', RUBY)) as { schedules: { last: unknown }[] }
    expect(result.schedules[0].last).toMatchObject({ status: 'passed' })
  })

  it.each([
    ['a list root', [ROW]],
    ['null', null],
    ['schedules not a list', { notice: null, schedules: 'x' }]
  ])('answers gem-output for %s', async (_label, json) => {
    deps.runGemCli.mockResolvedValue({ ok: true, stdout: '', stderr: '', json })
    expect(await call('list-schedules', RUBY)).toEqual({ error: 'gem-output' })
  })

  it('is exported for main callers with the same rows', async () => {
    deps.runGemCli.mockResolvedValue({
      ok: true,
      stdout: '',
      stderr: '',
      json: { notice: null, schedules: [ROW, null] }
    })
    const result = await listSchedules(project, RUBY, deps)
    expect(result).toMatchObject({ notice: null, schedules: [{ name: 'nightly' }] })
  })
})

describe('add-schedule', () => {
  it('runs `schedule add` with the request argv and hands back message and notice', async () => {
    deps.runGemCli.mockResolvedValue({
      ok: true,
      stdout: 'Scheduled nightly: every day at 09:30, next run Fri 09:30\n',
      stderr:
        "Could not add .raider/schedules/ to .gitignore: nope\nRemoved 1 schedule made with Ruby Raider 4.1 (old); it can\u001b't run in 4.2.\n"
    })
    expect(await call('add-schedule', RUBY, { ...REQUEST, notify: true })).toEqual({
      ok: true,
      message: 'Scheduled nightly: every day at 09:30, next run Fri 09:30',
      notice: "Removed 1 schedule made with Ruby Raider 4.1 (old); it can't run in 4.2."
    })
    expect(deps.runGemCli).toHaveBeenCalledWith(project, RUBY, [
      'schedule',
      'add',
      'nightly',
      '--every',
      'day',
      '--at',
      '09:30',
      '--retries',
      '0',
      '--notify'
    ])
  })

  it('has no notice when stderr holds none', async () => {
    deps.runGemCli.mockResolvedValue({ ok: true, stdout: 'Replaced nightly\n', stderr: 'warn\n' })
    expect(await call('add-schedule', RUBY, REQUEST)).toEqual({
      ok: true,
      message: 'Replaced nightly',
      notice: null
    })
  })

  it('sends listed files positional after NAME', async () => {
    const selection = { kind: 'files', files: ['spec/login_spec.rb', 'spec/cart_spec.rb'] }
    expect(await call('add-schedule', RUBY, { ...REQUEST, selection })).toMatchObject({ ok: true })
    expect(gemArgs()).toEqual([
      'schedule',
      'add',
      'nightly',
      'spec/login_spec.rb',
      'spec/cart_spec.rb',
      '--every',
      'day',
      '--at',
      '09:30',
      '--retries',
      '0',
      '--no-notify'
    ])
  })

  it('sends --tag, --show-browser, :MM and --on', async () => {
    await call('add-schedule', RUBY, {
      ...REQUEST,
      every: 'week',
      on: 'mon',
      showBrowser: true,
      selection: { kind: 'tag', tag: 'smoke' }
    })
    await call('add-schedule', RUBY, { ...REQUEST, every: 'hour', at: '00:15' })
    expect(gemArgs(0)).toEqual([
      'schedule',
      'add',
      'nightly',
      '--every',
      'week',
      '--at',
      '09:30',
      '--on',
      'mon',
      '--tag',
      'smoke',
      '--show-browser',
      '--retries',
      '0',
      '--no-notify'
    ])
    expect(gemArgs(1).slice(3, 7)).toEqual(['--every', 'hour', '--at', ':15'])
  })

  it.each(['../x', 'a b', 'A', 'x'.repeat(61), '-x', ''])(
    'refuses the hostile name %j without running the gem',
    async (name) => {
      expect(await call('add-schedule', RUBY, { ...REQUEST, name })).toMatchObject({
        error: 'invalid'
      })
      expect(deps.runGemCli).not.toHaveBeenCalled()
    }
  )

  it.each([';rm', '--project', 'a b', '-x'])('refuses the hostile tag %j', async (tag) => {
    const result = await call('add-schedule', RUBY, {
      ...REQUEST,
      selection: { kind: 'tag', tag }
    })
    expect(result).toMatchObject({ error: 'invalid' })
    expect(deps.runGemCli).not.toHaveBeenCalled()
  })

  it.each([
    '../a_spec.rb',
    '/abs_spec.rb',
    '-x_spec.rb',
    'spec/not_listed_spec.rb',
    'spec/login.rb'
  ])('refuses the file %j', async (file) => {
    const result = await call('add-schedule', RUBY, {
      ...REQUEST,
      selection: { kind: 'files', files: ['spec/login_spec.rb', file] }
    })
    expect(result).toMatchObject({ error: 'invalid' })
    expect(deps.runGemCli).not.toHaveBeenCalled()
  })

  it('refuses a 201-file selection before listing anything', async () => {
    const listed = vi.fn(listedFiles)
    register({ listedFiles: listed })
    const files = Array.from({ length: 201 }, (_, i) => `spec/t${i}_spec.rb`)
    const result = await call('add-schedule', RUBY, {
      ...REQUEST,
      selection: { kind: 'files', files }
    })
    expect(result).toMatchObject({ error: 'invalid' })
    expect(listed).not.toHaveBeenCalled()
    expect(deps.runGemCli).not.toHaveBeenCalled()
  })

  it('refuses --tag and files together, and unknown request keys', async () => {
    for (const payload of [
      { ...REQUEST, selection: { kind: 'tag', tag: 'a', files: ['spec/login_spec.rb'] } },
      { ...REQUEST, selection: { kind: 'files', files: ['spec/login_spec.rb'], tag: 'a' } },
      { ...REQUEST, project: '/etc' },
      'nightly',
      null
    ])
      expect(await call('add-schedule', RUBY, payload)).toMatchObject({ error: 'invalid' })
    expect(deps.runGemCli).not.toHaveBeenCalled()
  })

  it('refuses showBrowser on Linux, and allows it elsewhere', async () => {
    register({ platform: 'linux' })
    expect(await call('add-schedule', RUBY, { ...REQUEST, showBrowser: true })).toMatchObject({
      error: 'invalid'
    })
    expect(deps.runGemCli).not.toHaveBeenCalled()
    expect(await call('add-schedule', RUBY, REQUEST)).toMatchObject({ ok: true })
    register({ platform: 'win32' })
    expect(await call('add-schedule', RUBY, { ...REQUEST, showBrowser: true })).toMatchObject({
      ok: true
    })
  })

  it('answers no-project when the project changed while the files were listed', async () => {
    register({
      listedFiles: async (files) => ({ projectPath: '/other', files: files as string[] })
    })
    const selection = { kind: 'files', files: ['spec/login_spec.rb'] }
    expect(await call('add-schedule', RUBY, { ...REQUEST, selection })).toEqual({
      error: 'no-project'
    })
    expect(deps.runGemCli).not.toHaveBeenCalled()
  })
})

describe('refusals', () => {
  const refused = (
    stderr: string,
    message = stderr.trim().split('\n').pop()
  ): Record<string, unknown> => ({
    ok: false,
    error: 'refused',
    exitCode: 2,
    message,
    stderr
  })

  it('surfaces the gem refusal as its one line', async () => {
    deps.runGemCli.mockResolvedValue(refused("Show the browser isn't available on this machine\n"))
    expect(await call('add-schedule', RUBY, REQUEST)).toEqual({
      error: 'refused',
      message: "Show the browser isn't available on this machine"
    })
  })

  it('maps a 4.1 gem (no schedule command) to needs42', async () => {
    deps.runGemCli.mockResolvedValue(
      refused('Could not find command "schedule".\n', 'Could not find command "schedule".')
    )
    expect(await call('list-schedules', RUBY)).toEqual({ error: 'needs42' })
    expect(await call('remove-schedule', RUBY, 'nightly')).toEqual({ error: 'needs42' })
  })

  it.each([
    'bundler: failed to load command: raider (/x/bin/raider)\n/x/lib/a.rb:1: in `require`\n  from y',
    'Could not find ruby_raider-4.2.0 in locally installed gems\nRun `bundle install` to install missing gems.',
    "/x/kernel_require.rb:136:in `require': cannot load such file -- ruby_raider (LoadError)\n\tfrom /x/y.rb:2",
    'Your Ruby version is 3.1.0, but your Gemfile specified >= 3.2'
  ])('maps a gem that cannot load to rubyCantRun: %j', async (stderr) => {
    deps.runGemCli.mockResolvedValue({ ...refused(stderr), exitCode: 1 })
    expect(await call('add-schedule', RUBY, REQUEST)).toEqual({ error: 'rubyCantRun' })
  })

  it('passes ruby, timeout and gem-output through as codes', async () => {
    for (const error of ['ruby', 'timeout', 'gem-output']) {
      deps.runGemCli.mockResolvedValueOnce({ ok: false, error })
      expect(await call('list-schedules', RUBY)).toEqual({ error })
    }
  })
})

describe('remove-schedule', () => {
  it('runs `schedule remove NAME` and hands back message and notice', async () => {
    deps.runGemCli.mockResolvedValue({
      ok: true,
      stdout: 'Removed nightly (it was already gone from launchd)\n',
      stderr: ''
    })
    expect(await call('remove-schedule', RUBY, 'nightly')).toEqual({
      ok: true,
      message: 'Removed nightly (it was already gone from launchd)',
      notice: null
    })
    expect(gemArgs()).toEqual(['schedule', 'remove', 'nightly'])
  })

  it.each(['../x', 'a b', 'A', '-x', 'x'.repeat(61), 3])('refuses the name %j', async (name) => {
    expect(await call('remove-schedule', RUBY, name)).toMatchObject({ error: 'invalid' })
    expect(deps.runGemCli).not.toHaveBeenCalled()
  })
})

describe('open-schedule-report', () => {
  const ownReport = '.raider/schedules/nightly/last/index.html'

  it("opens the schedule's own last report", async () => {
    await write(ownReport, '<html>')
    await write('raider-results/index.html', '<html>')
    expect(await call('open-schedule-report', 'nightly')).toEqual({ ok: true })
    expect(deps.openPath).toHaveBeenCalledWith(path.join(project, ownReport))
  })

  it('falls back to raider-results/index.html', async () => {
    await write('raider-results/index.html', '<html>')
    expect(await call('open-schedule-report', 'nightly')).toEqual({ ok: true })
    expect(deps.openPath).toHaveBeenCalledWith(path.join(project, 'raider-results/index.html'))
  })

  it('answers noReport without either', async () => {
    expect(await call('open-schedule-report', 'nightly')).toEqual({ error: 'noReport' })
    expect(deps.openPath).not.toHaveBeenCalled()
  })

  it('refuses a linked report file and falls back', async () => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'schedules-out-'))
    try {
      await fs.writeFile(path.join(outside, 'index.html'), '<evil>')
      await fs.mkdir(path.join(project, '.raider/schedules/nightly/last'), { recursive: true })
      await fs.symlink(path.join(outside, 'index.html'), path.join(project, ownReport))
      expect(await call('open-schedule-report', 'nightly')).toEqual({ error: 'noReport' })
      await write('raider-results/index.html', '<html>')
      expect(await call('open-schedule-report', 'nightly')).toEqual({ ok: true })
      expect(deps.openPath).toHaveBeenCalledTimes(1)
      expect(deps.openPath).toHaveBeenCalledWith(path.join(project, 'raider-results/index.html'))
    } finally {
      await fs.rm(outside, { recursive: true, force: true })
    }
  })

  it('refuses a report under a linked folder, even one inside the project', async () => {
    await write('elsewhere/last/index.html', '<html>')
    await fs.mkdir(path.join(project, '.raider/schedules'), { recursive: true })
    await fs.symlink(
      path.join(project, 'elsewhere'),
      path.join(project, '.raider/schedules/nightly')
    )
    expect(await call('open-schedule-report', 'nightly')).toEqual({ error: 'noReport' })
    expect(deps.openPath).not.toHaveBeenCalled()
  })

  it('refuses a linked raider-results report too', async () => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'schedules-out-'))
    try {
      await fs.writeFile(path.join(outside, 'index.html'), '<evil>')
      await fs.symlink(outside, path.join(project, 'raider-results'))
      expect(await call('open-schedule-report', 'nightly')).toEqual({ error: 'noReport' })
    } finally {
      await fs.rm(outside, { recursive: true, force: true })
    }
  })

  it.each(['../x', '../../etc', 'A', 'a/b', 5])('refuses the name %j', async (name) => {
    expect(await call('open-schedule-report', name)).toMatchObject({ error: 'invalid' })
    expect(deps.openPath).not.toHaveBeenCalled()
  })

  it('reports an opener failure as one line', async () => {
    await write('raider-results/index.html', '<html>')
    deps.openPath.mockResolvedValueOnce('No app\nfor html')
    expect(await call('open-schedule-report', 'nightly')).toEqual({
      error: 'open-failed',
      message: 'No app'
    })
  })
})
