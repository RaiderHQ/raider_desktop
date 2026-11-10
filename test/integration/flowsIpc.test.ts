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

import { shell } from 'electron'
import { appState } from '../../src/main/handlers/appState'
import { registerFlowsIpc, type FlowsIpcDeps } from '../../src/main/handlers/flows/flowsIpc'
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
const SCHEDULE = { every: 'day', at: '09:30', retries: 0, notify: false, inputs: { hours: '5' } }

type Handler = (event: unknown, ...args: unknown[]) => Promise<unknown>

let project: string
let handlers: Map<string, Handler>
let runFlowCli: ReturnType<typeof vi.fn>

const main = { sender: { id: MAIN_ID } }
const call = (channel: string, ...args: unknown[]): Promise<unknown> =>
  handlers.get(channel)!(main, ...args)

async function write(rel: string, body = ''): Promise<void> {
  await fs.mkdir(path.dirname(path.join(project, rel)), { recursive: true })
  await fs.writeFile(path.join(project, rel), body)
}

beforeEach(async () => {
  project = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'flows-ipc-')))
  await write('Gemfile.lock', LOCK('4.1.0'))
  await write('flows/flow_helper.rb')
  await write('flows/report_flow.rb')
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
  appState.mainWindow = null
  appState.projectPath = null
  appState.layout = null
  await fs.rm(project, { recursive: true, force: true })
})

describe('sender check', () => {
  it.each([
    ['flows-status', []],
    ['list-flows', [RUBY]],
    ['list-schedules', [RUBY]],
    ['setup-flows', [RUBY]],
    ['schedule-flow', [RUBY, 'report', SCHEDULE]],
    ['unschedule-flow', [RUBY, 'report']],
    ['open-flow-results', ['report', 'flow-results/report/20261110T110856Z']],
    ['flow-last-results', ['report']]
  ])('%s refuses a sender that is not the main window', async (channel, args) => {
    expect(await handlers.get(channel)!({ sender: { id: 99 } }, ...args)).toEqual(
      channel === 'flow-last-results'
        ? null
        : channel === 'open-flow-results'
          ? { success: false, error: 'invalid' }
          : { error: 'invalid' }
    )
    expect(runFlowCli).not.toHaveBeenCalled()
    expect(vi.mocked(shell.openPath)).not.toHaveBeenCalled()
  })
})

describe('flows-status', () => {
  it('is ready for a set-up 4.1 project', async () => {
    expect(await call('flows-status', RUBY)).toEqual({ state: 'ready' })
  })

  it('is no-project without a project', async () => {
    appState.projectPath = null
    expect(await call('flows-status', RUBY)).toEqual({ state: 'no-project' })
  })

  it('needs setup without flows/flow_helper.rb', async () => {
    await fs.rm(path.join(project, 'flows/flow_helper.rb'))
    expect(await call('flows-status', RUBY)).toEqual({ state: 'needs-setup' })
  })

  it('is unsupported/gem below 4.1 or without a lock', async () => {
    await write('Gemfile.lock', LOCK('4.0.3'))
    expect(await call('flows-status', RUBY)).toEqual({ state: 'unsupported', reason: 'gem' })
    await fs.rm(path.join(project, 'Gemfile.lock'))
    expect(await call('flows-status', RUBY)).toEqual({ state: 'unsupported', reason: 'gem' })
  })

  it('is unsupported/gem for a gem below 4.0 (layout gemTooOld)', async () => {
    appState.layout = { ...LAYOUT, recordable: false, unsupportedReason: 'gemTooOld' }
    expect(await call('flows-status', RUBY)).toEqual({ state: 'unsupported', reason: 'gem' })
  })

  it('is unsupported/project for mobile or unrecordable layouts', async () => {
    appState.layout = { ...LAYOUT, recordable: false, unsupportedReason: 'mobile' }
    expect(await call('flows-status', RUBY)).toEqual({ state: 'unsupported', reason: 'project' })
    appState.layout = { ...LAYOUT, recordable: false, unsupportedReason: 'minitest' }
    expect(await call('flows-status', RUBY)).toEqual({ state: 'unsupported', reason: 'project' })
  })
})

describe('list-flows / list-schedules', () => {
  it('runs list --json against the active project and parses the flows', async () => {
    runFlowCli.mockResolvedValue({
      ok: true,
      stdout: '',
      json: [{ name: 'report', file: 'flows/report_flow.rb', last: null }, { name: '../x' }]
    })
    expect(await call('list-flows', RUBY)).toEqual({
      flows: [{ name: 'report', file: 'flows/report_flow.rb', last: null }]
    })
    expect(runFlowCli).toHaveBeenCalledWith(project, RUBY, ['list', '--json'], { json: true })
  })

  it('maps a non-list to gem-output and passes CLI errors on', async () => {
    runFlowCli.mockResolvedValueOnce({ ok: true, stdout: '', json: {} })
    expect(await call('list-schedules', RUBY)).toEqual({ error: 'gem-output' })
    runFlowCli.mockResolvedValueOnce({ ok: false, error: 'timeout' })
    expect(await call('list-schedules', RUBY)).toEqual({ error: 'timeout' })
    expect(runFlowCli).toHaveBeenLastCalledWith(project, RUBY, ['schedules', '--json'], {
      json: true
    })
  })

  it('refuses an invalid ruby command and an unready project without running the gem', async () => {
    expect(await call('list-flows', 'ruby; rm -rf ~')).toMatchObject({ error: 'invalid' })
    await fs.rm(path.join(project, 'flows/flow_helper.rb'))
    expect(await call('list-flows', RUBY)).toEqual({ error: 'unsupported' })
    appState.projectPath = null
    expect(await call('list-flows', RUBY)).toEqual({ error: 'no-project' })
    expect(runFlowCli).not.toHaveBeenCalled()
  })
})

describe('setup-flows', () => {
  it('runs init when the project needs setup', async () => {
    await fs.rm(path.join(project, 'flows'), { recursive: true })
    expect(await call('setup-flows', RUBY)).toEqual({ ok: true })
    expect(runFlowCli).toHaveBeenCalledWith(project, RUBY, ['init'])
  })

  it('refuses below 4.1', async () => {
    await write('Gemfile.lock', LOCK('4.0.0'))
    expect(await call('setup-flows', RUBY)).toEqual({ error: 'unsupported' })
    expect(runFlowCli).not.toHaveBeenCalled()
  })

  it('passes a refusal with its message', async () => {
    runFlowCli.mockResolvedValue({ ok: false, error: 'refused', message: 'nope', exitCode: 2 })
    expect(await call('setup-flows', RUBY)).toEqual({ error: 'refused', message: 'nope' })
  })
})

describe('schedule-flow', () => {
  it('schedules an existing flow with the validated argv and returns the first stdout line', async () => {
    runFlowCli.mockResolvedValue({
      ok: true,
      stdout: 'Scheduled report daily\u001b at 09:30\nmore\n'
    })
    expect(await call('schedule-flow', RUBY, 'report', SCHEDULE)).toEqual({
      ok: true,
      message: 'Scheduled report daily at 09:30'
    })
    expect(runFlowCli).toHaveBeenCalledWith(project, RUBY, [
      'schedule',
      'report',
      '--every',
      'day',
      '--at',
      '09:30',
      '--retries',
      '0',
      '--input',
      'hours=5'
    ])
  })

  it('passes two inputs after a single --input so the gem keeps both', async () => {
    runFlowCli.mockResolvedValue({ ok: true, stdout: 'Scheduled report\n' })
    await call('schedule-flow', RUBY, 'report', {
      ...SCHEDULE,
      inputs: { hours: '5', project: 'Apollo' }
    })
    const args: string[] = runFlowCli.mock.calls.at(-1)[2]
    expect(args.filter((a) => a === '--input')).toHaveLength(1)
    expect(args.slice(-3)).toEqual(['--input', 'hours=5', 'project=Apollo'])
  })

  it.each([
    ['a bad name', '../x', SCHEDULE],
    ['a reserved name', 'env', SCHEDULE],
    ['a non-string name', ['report'], SCHEDULE],
    ['a missing flow file', 'missing', SCHEDULE],
    ['a bad schedule', 'report', { ...SCHEDULE, retries: 4 }],
    ['an input with a newline', 'report', { ...SCHEDULE, inputs: { a: 'x\ny' } }]
  ])('refuses %s', async (_label, name, schedule) => {
    expect(await call('schedule-flow', RUBY, name, schedule)).toMatchObject({ error: 'invalid' })
    expect(runFlowCli).not.toHaveBeenCalled()
  })

  it('refuses a flow file that links out of the project', async () => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'flows-out-'))
    await fs.writeFile(path.join(outside, 'x.rb'), '')
    await fs.symlink(path.join(outside, 'x.rb'), path.join(project, 'flows/linked_flow.rb'))
    expect(await call('schedule-flow', RUBY, 'linked', SCHEDULE)).toMatchObject({
      error: 'invalid'
    })
    await fs.rm(outside, { recursive: true, force: true })
  })
})

describe('unschedule-flow', () => {
  it('unschedules by name, even when the flow file is gone', async () => {
    expect(await call('unschedule-flow', RUBY, 'gone')).toEqual({ ok: true })
    expect(runFlowCli).toHaveBeenCalledWith(project, RUBY, ['unschedule', 'gone'])
  })

  it('refuses a bad name', async () => {
    expect(await call('unschedule-flow', RUBY, 'Bad')).toMatchObject({ error: 'invalid' })
    expect(runFlowCli).not.toHaveBeenCalled()
  })
})

const DIR = 'flow-results/report/20261110T110856Z'
const logLine = (extra: Record<string, unknown>): string =>
  JSON.stringify({
    started_at: '2026-11-10T11:08:56.508Z',
    attempt: 1,
    trigger: 'manual',
    run_id: '0123456789abcdef',
    finished_at: '2026-11-10T11:08:59.480Z',
    status: 'completed',
    results_dir: DIR,
    ...extra
  })

describe('open-flow-results', () => {
  beforeEach(() => vi.mocked(shell.openPath).mockClear())

  it("opens the run's index.html", async () => {
    await write(`${DIR}/index.html`, '<html>')
    expect(await call('open-flow-results', 'report', DIR)).toEqual({ success: true })
    expect(shell.openPath).toHaveBeenCalledWith(path.join(project, DIR, 'index.html'))
  })

  it('passes on the error openPath answers with', async () => {
    await write(`${DIR}/index.html`, '<html>')
    vi.mocked(shell.openPath).mockResolvedValueOnce('No app')
    expect(await call('open-flow-results', 'report', DIR)).toEqual({
      success: false,
      error: 'No app'
    })
  })

  it.each([
    ['a bad name', 'Report', DIR],
    ["another flow's folder", 'report', 'flow-results/other/20261110T110856Z'],
    ['a .. path', 'report', 'flow-results/report/../other/20261110T110856Z'],
    ['raider-results', 'report', 'raider-results'],
    ['a non-string folder', 'report', 42]
  ])('refuses %s', async (_label, name, dir) => {
    await write(`${DIR}/index.html`, '<html>')
    await write('flow-results/other/20261110T110856Z/index.html', '<html>')
    await write('raider-results/index.html', '<html>')
    expect(await call('open-flow-results', name, dir)).toEqual({ success: false, error: 'invalid' })
    expect(shell.openPath).not.toHaveBeenCalled()
  })

  it('refuses a symlinked index.html', async () => {
    await write('elsewhere.html', '<html>')
    await fs.mkdir(path.join(project, DIR), { recursive: true })
    await fs.symlink(path.join(project, 'elsewhere.html'), path.join(project, DIR, 'index.html'))
    expect(await call('open-flow-results', 'report', DIR)).toMatchObject({ success: false })
    expect(shell.openPath).not.toHaveBeenCalled()
  })

  it("refuses a run folder that links to another flow's", async () => {
    await write('flow-results/other/20261110T110856Z/index.html', '<html>')
    await fs.mkdir(path.join(project, 'flow-results/report'), { recursive: true })
    await fs.symlink(
      path.join(project, 'flow-results/other/20261110T110856Z'),
      path.join(project, DIR)
    )
    expect(await call('open-flow-results', 'report', DIR)).toMatchObject({ success: false })
    expect(shell.openPath).not.toHaveBeenCalled()
  })

  it('refuses without a project', async () => {
    await write(`${DIR}/index.html`, '<html>')
    appState.projectPath = null
    expect(await call('open-flow-results', 'report', DIR)).toMatchObject({ success: false })
    expect(shell.openPath).not.toHaveBeenCalled()
  })
})

describe('flow-last-results', () => {
  const log = (...lines: string[]): Promise<void> =>
    write('.raider/flows/report/runs.jsonl', `${lines.join('\n')}\n`)

  it('gives the newest run that ran, skipping a busy line', async () => {
    await write(`${DIR}/run.json`, '{}')
    await write('flow-results/report/20261110T100000Z/run.json', '{}')
    await log(
      logLine({ results_dir: 'flow-results/report/20261110T100000Z' }),
      logLine({ status: 'failed', failed_step: { title: 'runs', line: 7 } }),
      logLine({ status: 'busy', results_dir: null })
    )
    expect(await call('flow-last-results', 'report')).toEqual({
      resultsDir: DIR,
      finishedAt: '2026-11-10T11:08:59.480Z',
      status: 'failed'
    })
  })

  it("is null when the newest run's folder is not valid, never an older run's", async () => {
    await write('flow-results/report/20261110T100000Z/run.json', '{}')
    await write('flow-results/other/20261110T110856Z/run.json', '{}')
    await log(
      logLine({ results_dir: 'flow-results/report/20261110T100000Z' }),
      logLine({ results_dir: 'flow-results/other/20261110T110856Z' })
    )
    expect(await call('flow-last-results', 'report')).toBeNull()
  })

  it('is null without a log, for a bad name, and for a symlinked log', async () => {
    expect(await call('flow-last-results', 'report')).toBeNull()
    expect(await call('flow-last-results', '../report')).toBeNull()
    await write(`${DIR}/run.json`, '{}')
    await write('elsewhere.jsonl', `${logLine({})}\n`)
    await fs.mkdir(path.join(project, '.raider/flows/report'), { recursive: true })
    await fs.symlink(
      path.join(project, 'elsewhere.jsonl'),
      path.join(project, '.raider/flows/report/runs.jsonl')
    )
    expect(await call('flow-last-results', 'report')).toBeNull()
  })
})
