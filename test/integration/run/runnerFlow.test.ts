// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { RunEvent, RunRequest } from '../../../src/shared/types/runEvents'

vi.mock('electron', () => ({ app: { getPath: vi.fn(() => os.tmpdir()) } }))
vi.mock('../../../src/main/handlers/longship/pushToLongship', () => ({
  pushToLongship: vi.fn(async () => undefined)
}))
vi.mock('../../../src/main/handlers/project/setActiveProject', () => ({
  activationSettled: vi.fn(async () => undefined)
}))
const LISTED = ['spec/a_spec.rb', 'spec/b_spec.rb', 'flows/hello_flow.rb', 'flows/other_flow.rb']
vi.mock('../../../src/main/handlers/tests/projectTestIpc', () => ({
  listedFiles: vi.fn(async (files: unknown[]) => {
    for (const file of files) {
      if (typeof file !== 'string' || !LISTED.includes(file)) {
        throw new Error(`Not a project test: ${String(file)}`)
      }
    }
    return { projectPath: '', layout: {}, files }
  })
}))

import { appState } from '../../../src/main/handlers/appState'
import { pushToLongship } from '../../../src/main/handlers/longship/pushToLongship'
import {
  cancelRun,
  getActiveRun,
  startRun,
  type RunnerDeps
} from '../../../src/main/handlers/run/runner'

const FIXTURE = path.join(__dirname, 'fixtures', 'fake-run.mjs')
const LIVE_LOCK = 'GEM\n  specs:\n    raider_reporter (0.11.0)\n'
const OLD_LOCK = 'GEM\n  specs:\n    raider_reporter (0.10.0)\n'
const STAMP = '20261110T110856Z'
const OURS_DIR = `flow-results/hello/${STAMP}`

type Finished = Extract<RunEvent, { type: 'run:finished' }>

const flowRun = (overrides: Partial<NonNullable<RunRequest['flow']>> = {}): RunRequest => ({
  scope: { kind: 'files', files: ['flows/hello_flow.rb'] },
  rubyCommand: 'ruby',
  flow: { name: 'hello', inputs: {}, headed: false, ...overrides }
})

const line = (extra: Record<string, unknown>): Record<string, unknown> => ({
  started_at: '2026-11-10T11:08:56.508Z',
  attempt: 1,
  trigger: 'desktop',
  finished_at: '2026-11-10T11:08:59.480Z',
  status: 'completed',
  ...extra
})

describe('runner: flows', () => {
  let project: string
  let tempRoot: string
  let events: RunEvent[]
  let deps: Partial<RunnerDeps> & { spawnCommand: ReturnType<typeof vi.fn> }
  let script: object

  const fakeSpawn = (_cmd: string, cwd: string, env: NodeJS.ProcessEnv): ReturnType<typeof spawn> =>
    spawn(process.execPath, [FIXTURE], {
      cwd,
      env: { ...env, FAKE_SCRIPT: JSON.stringify(script) },
      detached: process.platform !== 'win32'
    })

  const finishedEvent = async (runId: string, ms = 5000): Promise<Finished> => {
    const until = Date.now() + ms
    for (;;) {
      const done = events.find((e): e is Finished => e.type === 'run:finished' && e.runId === runId)
      if (done) return done
      if (Date.now() > until) throw new Error('timed out waiting')
      await new Promise((r) => setTimeout(r, 10))
    }
  }

  const run = async (request: RunRequest): Promise<Finished> => {
    const result = await startRun(request, deps)
    if (!('runId' in result)) throw new Error(`startRun failed: ${result.error}`)
    return finishedEvent(result.runId)
  }

  const spawnedEnv = (): NodeJS.ProcessEnv => deps.spawnCommand.mock.calls[0][2]
  const mkdir = (rel: string): void => fs.mkdirSync(path.join(project, rel), { recursive: true })

  beforeEach(() => {
    project = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-flow-'))
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-flow-temp-'))
    fs.writeFileSync(path.join(project, 'Gemfile.lock'), LIVE_LOCK)
    appState.projectPath = project
    appState.layout = null
    events = []
    script = { steps: [] }
    deps = {
      send: (e: RunEvent): void => {
        events.push(e)
      },
      spawnCommand: vi.fn(fakeSpawn),
      tempRoot,
      ensureBundle: async (): Promise<{ ok: boolean }> => ({ ok: true }),
      graceMs: 200
    }
  })

  afterEach(async () => {
    const active = getActiveRun()
    if (active && !active.events.some((e) => e.type === 'run:finished')) {
      await cancelRun(active.runId)
      await finishedEvent(active.runId, 15_000)
    }
    delete process.env.RAIDER_INPUT_OLD
    delete process.env.RAIDER_FLOW_TRIGGER
    fs.rmSync(project, { recursive: true, force: true })
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  describe('validation', () => {
    const many = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`in${i}`, 'x']))
    it.each<[string, unknown]>([
      [
        'another flow file',
        { ...flowRun(), scope: { kind: 'files', files: ['flows/other_flow.rb'] } }
      ],
      [
        'two files',
        {
          ...flowRun(),
          scope: { kind: 'files', files: ['flows/hello_flow.rb', 'flows/other_flow.rb'] }
        }
      ],
      ['a test file', { ...flowRun(), scope: { kind: 'files', files: ['spec/a_spec.rb'] } }],
      ['a tags scope', { ...flowRun(), scope: { kind: 'tags', tags: ['smoke'] } }],
      ['a bad name', { ...flowRun(), flow: { name: 'Hello', inputs: {}, headed: false } }],
      ['a reserved name', { ...flowRun(), flow: { name: 'env', inputs: {}, headed: false } }],
      ['21 inputs', flowRun({ inputs: many })],
      ['a NUL in a value', flowRun({ inputs: { hours: '7\0' } })],
      ['a bad input name', flowRun({ inputs: { Hours: '7' } })],
      [
        'a non-boolean headed',
        { ...flowRun(), flow: { name: 'hello', inputs: {}, headed: 'yes' } }
      ],
      [
        'an extra key',
        { ...flowRun(), flow: { name: 'hello', inputs: {}, headed: false, cmd: 'x' } }
      ],
      ['2 workers', { ...flowRun(), workers: 2 }],
      ['a flow that is not an object', { ...flowRun(), flow: 'hello' }]
    ])('refuses %s and spawns nothing', async (_label, request) => {
      const result = await startRun(request as RunRequest, deps)
      expect(result).toHaveProperty('error')
      expect(deps.spawnCommand).not.toHaveBeenCalled()
    })

    it('accepts a valid flow run, serially, on its own file', async () => {
      const done = await run({ ...flowRun({ inputs: { hours: '7' } }), workers: 1 })
      expect(deps.spawnCommand).toHaveBeenCalledTimes(1)
      const cmd = deps.spawnCommand.mock.calls[0][0] as string
      expect(cmd).toContain('rspec')
      expect(cmd).toContain('flows/hello_flow.rb')
      expect(cmd).not.toContain('parallel_rspec')
      expect(getActiveRun()?.request.flow).toEqual({
        name: 'hello',
        inputs: { hours: '7' },
        headed: false
      })
      expect(done.flow).toEqual({ name: 'hello', status: null, resultsDir: null, failedStep: null })
    })
  })

  describe('environment', () => {
    it('passes the inputs and flow settings only through the env', async () => {
      process.env.RAIDER_INPUT_OLD = 'stale'
      process.env.RAIDER_FLOW_TRIGGER = 'schedule'
      const hostile = '7; rm -rf ~'
      await run(flowRun({ inputs: { hours: '7', note: hostile } }))
      const env = spawnedEnv()
      expect(env.RAIDER_INPUT_HOURS).toBe('7')
      expect(env.RAIDER_INPUT_NOTE).toBe(hostile)
      expect(env.RAIDER_FLOW_NAME).toBe('hello')
      expect(env.RAIDER_FLOW_TRIGGER).toBe('desktop')
      expect(env.RAIDER_FLOW_RUN_ID).toMatch(/^[0-9a-f]{16}$/)
      expect(env).not.toHaveProperty('RAIDER_INPUT_OLD')
      expect(env).not.toHaveProperty('RAIDER_FLOW_HEADED')
      expect(deps.spawnCommand.mock.calls[0][0]).not.toContain(hostile)
      expect(deps.spawnCommand.mock.calls[0][0]).not.toContain('rm -rf')
    })

    it('sets RAIDER_FLOW_HEADED only for a headed run', async () => {
      await run(flowRun({ headed: true }))
      expect(spawnedEnv().RAIDER_FLOW_HEADED).toBe('1')
    })

    it('a test run inherits no flow settings or inputs', async () => {
      process.env.RAIDER_INPUT_OLD = 'stale'
      process.env.RAIDER_FLOW_TRIGGER = 'schedule'
      const done = await run({ scope: { kind: 'all' }, rubyCommand: 'ruby' })
      const env = spawnedEnv()
      expect(Object.keys(env).filter((k) => /^RAIDER_(FLOW|INPUT)_/i.test(k))).toEqual([])
      expect(done).not.toHaveProperty('flow')
    })

    it('two flow runs get different run ids', async () => {
      await run(flowRun())
      await run(flowRun())
      const ids = deps.spawnCommand.mock.calls.map((c) => c[2].RAIDER_FLOW_RUN_ID)
      expect(ids[0]).not.toBe(ids[1])
    })
  })

  describe("the gem's run log", () => {
    it("takes this run's line by run id, not the last line", async () => {
      mkdir('flow-results/hello/20261110T110000Z')
      mkdir('flow-results/hello/20261110T120000Z')
      script = {
        steps: [
          { flowRunJson: { dir: OURS_DIR, statuses: ['failed'] } },
          {
            flowLog: {
              name: 'hello',
              lines: [
                line({
                  run_id: 'aaaaaaaaaaaaaaaa',
                  results_dir: 'flow-results/hello/20261110T110000Z'
                }),
                line({
                  ours: true,
                  status: 'failed',
                  results_dir: OURS_DIR,
                  failed_step: { number: 2, title: 'runs', line: 7 }
                }),
                'not json',
                line({
                  run_id: 'bbbbbbbbbbbbbbbb',
                  results_dir: 'flow-results/hello/20261110T120000Z'
                })
              ]
            }
          }
        ],
        exitCode: 1
      }
      const done = await run(flowRun())
      expect(done.flow).toEqual({
        name: 'hello',
        status: 'failed',
        resultsDir: OURS_DIR,
        failedStep: { number: 2, title: 'runs', line: 7 }
      })
    })

    it('drops a bad failed_step', async () => {
      mkdir(OURS_DIR)
      script = {
        steps: [
          {
            flowLog: {
              name: 'hello',
              lines: [
                line({
                  ours: true,
                  status: 'failed',
                  results_dir: OURS_DIR,
                  failed_step: { title: 'x'.repeat(501), line: 7 }
                })
              ]
            }
          }
        ]
      }
      expect((await run(flowRun())).flow).toMatchObject({ status: 'failed', failedStep: null })
    })

    const hostile = (): [string, string][] => [
      ['a .. path', 'flow-results/hello/../other/20261110T110856Z'],
      ["another flow's folder", 'flow-results/other/20261110T110856Z'],
      ['an absolute path', path.join(project, OURS_DIR)],
      ['raider-results', 'raider-results'],
      ['a bad stamp', 'flow-results/hello/latest']
    ]
    for (const index of [0, 1, 2, 3, 4]) {
      it(`refuses a hostile results_dir (#${index})`, async () => {
        const [, dir] = hostile()[index]
        mkdir(OURS_DIR)
        mkdir('flow-results/other/20261110T110856Z')
        mkdir('flow-results/hello/latest')
        mkdir('raider-results')
        script = {
          steps: [{ flowLog: { name: 'hello', lines: [line({ ours: true, results_dir: dir })] } }]
        }
        expect((await run(flowRun())).flow).toEqual({
          name: 'hello',
          status: 'completed',
          resultsDir: null,
          failedStep: null
        })
      })
    }

    it.skipIf(process.platform === 'win32')(
      "refuses a results folder that links to another flow's",
      async () => {
        mkdir('flow-results/other/20261110T110856Z')
        mkdir('flow-results/hello')
        fs.symlinkSync(
          path.join(project, 'flow-results/other/20261110T110856Z'),
          path.join(project, OURS_DIR)
        )
        script = {
          steps: [
            { flowLog: { name: 'hello', lines: [line({ ours: true, results_dir: OURS_DIR })] } }
          ]
        }
        expect((await run(flowRun())).flow?.resultsDir).toBeNull()
      }
    )

    it.skipIf(process.platform === 'win32')('refuses a symlinked runs.jsonl', async () => {
      mkdir(OURS_DIR)
      mkdir('.raider/flows/hello')
      fs.writeFileSync(path.join(project, 'elsewhere.jsonl'), '')
      fs.symlinkSync(
        path.join(project, 'elsewhere.jsonl'),
        path.join(project, '.raider/flows/hello/runs.jsonl')
      )
      script = {
        steps: [
          { flowLog: { name: 'hello', lines: [line({ ours: true, results_dir: OURS_DIR })] } }
        ]
      }
      const done = await run(flowRun())
      // The line is really there, through the link
      expect(fs.readFileSync(path.join(project, 'elsewhere.jsonl'), 'utf8')).toContain(OURS_DIR)
      expect(done.flow?.status).toBeNull()
    })

    it('finishes with a null status when the log is missing', async () => {
      const done = await run(flowRun())
      expect(done.flow).toEqual({ name: 'hello', status: null, resultsDir: null, failedStep: null })
    })

    it('finishes with flow nulls when the run never starts', async () => {
      deps.ensureBundle = async (): Promise<{ ok: boolean; error?: string }> => ({
        ok: false,
        error: 'no gems'
      })
      const done = await run(flowRun())
      expect(deps.spawnCommand).not.toHaveBeenCalled()
      expect(done.flow).toEqual({ name: 'hello', status: null, resultsDir: null, failedStep: null })
    })
  })

  describe('counts without live events', () => {
    beforeEach(() => fs.writeFileSync(path.join(project, 'Gemfile.lock'), OLD_LOCK))

    it("counts from the flow run's own run.json, not raider-results", async () => {
      script = {
        steps: [
          { runJson: ['passed', 'passed', 'passed'] },
          { flowRunJson: { dir: OURS_DIR, statuses: ['passed', 'failed'] } },
          {
            flowLog: {
              name: 'hello',
              lines: [line({ ours: true, status: 'failed', results_dir: OURS_DIR })]
            }
          }
        ],
        exitCode: 1
      }
      const done = await run(flowRun())
      expect(done.counts).toMatchObject({ total: 2, passed: 1, failed: 1 })
      expect(done.status).toBe('failed')
    })

    it('counts nothing when no log line matched, even with a fresh raider-results', async () => {
      script = {
        steps: [{ runJson: ['passed'] }, { flowRunJson: { dir: OURS_DIR, statuses: ['passed'] } }]
      }
      const done = await run(flowRun())
      expect(done.counts.total).toBe(0)
    })
  })

  describe('Longship', () => {
    it("never pushes a flow run's output (it is a job, not a test result)", async () => {
      vi.mocked(pushToLongship).mockClear()
      mkdir(OURS_DIR)
      script = {
        steps: [
          { stdout: 'typed 8 hours for Jane\n' },
          {
            flowLog: {
              name: 'hello',
              lines: [line({ ours: true, status: 'completed', results_dir: OURS_DIR })]
            }
          }
        ]
      }
      const done = await run(flowRun())
      expect(done.flow).toMatchObject({ status: 'completed' })
      await new Promise((r) => setTimeout(r, 50))
      expect(pushToLongship).not.toHaveBeenCalled()
    })
  })
})
