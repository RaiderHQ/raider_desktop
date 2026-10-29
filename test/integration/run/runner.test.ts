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
const LISTED = ['spec/a_spec.rb', 'spec/b_spec.rb']
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
import { listedFiles } from '../../../src/main/handlers/tests/projectTestIpc'
import {
  cancelRun,
  getActiveRun,
  killActiveRun,
  startRun,
  type RunnerDeps
} from '../../../src/main/handlers/run/runner'

const FIXTURE = path.join(__dirname, 'fixtures', 'fake-run.mjs')
const LIVE_LOCK = 'GEM\n  specs:\n    raider_reporter (0.11.0)\n'
const OLD_LOCK = 'GEM\n  specs:\n    raider_reporter (0.10.0)\n'

const test = (id: string): Record<string, unknown> => ({
  id,
  file: 'spec/a_spec.rb',
  line: 3,
  description: id,
  full_name: `A ${id}`
})
const plan = (...ids: string[]): object => ({ v: 1, type: 'plan', tests: ids.map(test) })
const started = (id: string): object => ({ v: 1, type: 'started', ...test(id) })
const finished = (id: string, status: string): object => ({ v: 1, type: 'finished', id, status })

const ALL: RunRequest = { scope: { kind: 'all' }, rubyCommand: 'ruby' }

describe('runner', () => {
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

  const waitFor = async <T>(fn: () => T | undefined, ms = 5000): Promise<T> => {
    const until = Date.now() + ms
    for (;;) {
      const value = fn()
      if (value !== undefined) return value
      if (Date.now() > until) throw new Error('timed out waiting')
      await new Promise((r) => setTimeout(r, 10))
    }
  }

  const finishedEvent = (
    runId: string,
    ms?: number
  ): Promise<Extract<RunEvent, { type: 'run:finished' }>> =>
    waitFor(
      () =>
        events.find(
          (e): e is Extract<RunEvent, { type: 'run:finished' }> =>
            e.type === 'run:finished' && e.runId === runId
        ),
      ms
    )

  const run = async (request: RunRequest = ALL): Promise<string> => {
    const result = await startRun(request, deps)
    if (!('runId' in result)) throw new Error(`startRun failed: ${result.error}`)
    return result.runId
  }

  const ofRun = (runId: string): RunEvent[] => events.filter((e) => e.runId === runId)

  beforeEach(() => {
    project = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-project-'))
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-temp-'))
    fs.mkdirSync(path.join(project, 'spec'))
    fs.writeFileSync(path.join(project, 'Gemfile.lock'), LIVE_LOCK)
    appState.projectPath = project
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
    vi.mocked(pushToLongship).mockClear()
  })

  afterEach(async () => {
    // A failed test must not leave the app-wide run busy for the next one
    const active = getActiveRun()
    if (active && !active.events.some((e) => e.type === 'run:finished')) {
      await cancelRun(active.runId)
      await finishedEvent(active.runId, 15_000)
    }
    fs.rmSync(project, { recursive: true, force: true })
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  it('streams started, phase booting→running, examples and finished passed', async () => {
    script = {
      steps: [
        { event: plan('t1') },
        { event: started('t1'), stdout: 'running t1\n' },
        { event: finished('t1', 'passed'), delay: 20 }
      ],
      exitCode: 0
    }
    const runId = await run()
    const done = await finishedEvent(runId)

    const sequence = ofRun(runId)
      .filter((e) => e.type !== 'run:output')
      .map((e) =>
        e.type === 'run:phase'
          ? `phase:${e.phase}`
          : e.type === 'run:example'
            ? `example:${e.status}`
            : e.type
      )
    expect(sequence).toEqual([
      'run:started',
      'phase:booting',
      'phase:running',
      'run:planned',
      'example:started',
      'example:passed',
      'run:finished'
    ])
    const startedEvent = ofRun(runId)[0] as Extract<RunEvent, { type: 'run:started' }>
    expect(startedEvent).toMatchObject({ framework: 'rspec', workers: 1, liveEvents: true })
    expect(done).toMatchObject({ status: 'passed', exitCode: 0 })
    expect(done.counts).toMatchObject({ total: 1, passed: 1 })
    const stdout = ofRun(runId)
      .filter((e) => e.type === 'run:output')
      .map((e) => (e.type === 'run:output' ? e.chunk : ''))
      .join('')
    expect(stdout).toContain('running t1')

    const [cmd, cwd, env] = deps.spawnCommand.mock.calls[0]
    expect(cmd).toContain('ruby -S bundle exec rspec')
    expect(cwd).toBe(project)
    expect(env.RAIDER_EVENTS_DIR).toBe(path.join(tempRoot, runId))
    expect(env.RUBYOPT).toContain('-EUTF-8')
    expect(String(env.PATH)).not.toContain(path.join('node_modules', '.bin'))
    await waitFor(() => (vi.mocked(pushToLongship).mock.calls.length ? true : undefined))
    expect(vi.mocked(pushToLongship).mock.calls[0][0]).toBe(true)
  })

  it('a parallel run splits output by worker prefix and tags events with the worker', async () => {
    script = {
      steps: [
        { event: plan('t1'), worker: 2 },
        { stdout: '[TEST GROUP 2] two\n[TEST GROUP ' },
        { stdout: '] one\n', delay: 80 },
        { event: finished('t1', 'passed'), worker: 2 }
      ],
      exitCode: 0
    }
    const runId = await run({ ...ALL, workers: 2 })
    await finishedEvent(runId)
    expect(deps.spawnCommand.mock.calls[0][0]).toContain('parallel_rspec -n 2')
    const output = ofRun(runId).flatMap((e) =>
      e.type === 'run:output' ? [[e.worker, e.chunk] as const] : []
    )
    expect(output).toEqual([
      [2, 'two\n'],
      [1, 'one\n']
    ])
    expect(ofRun(runId).find((e) => e.type === 'run:planned')).toMatchObject({ worker: 2 })
  })

  it('exit 1 with a failed example finishes failed', async () => {
    script = {
      steps: [{ event: plan('t1') }, { event: finished('t1', 'failed') }],
      exitCode: 1
    }
    const runId = await run()
    const done = await finishedEvent(runId)
    expect(done).toMatchObject({ status: 'failed', exitCode: 1 })
    expect(done.counts).toMatchObject({ total: 1, failed: 1 })
  })

  it('a crash after the plan, before any result, finishes errored', async () => {
    script = { steps: [{ event: plan('t1', 't2') }], exitCode: 1 }
    const runId = await run()
    const done = await finishedEvent(runId)
    expect(done).toMatchObject({ status: 'errored', exitCode: 1 })
    expect(done.counts).toMatchObject({ total: 2, passed: 0, failed: 0 })
  })

  it('exit before any plan finishes errored with stderr in run:output', async () => {
    script = { steps: [{ stderr: 'LoadError: cannot load such file\n' }], exitCode: 1 }
    const runId = await run()
    const done = await finishedEvent(runId)
    expect(done.status).toBe('errored')
    const stderr = ofRun(runId).filter((e) => e.type === 'run:output' && e.stream === 'stderr')
    expect(stderr.map((e) => (e.type === 'run:output' ? e.chunk : '')).join('')).toContain(
      'LoadError'
    )
  })

  it("second startRun while running returns {error:'busy'}", async () => {
    script = { steps: [], hang: true }
    // Two calls in the same tick: the slot is taken before validation awaits
    const [first, second] = await Promise.all([startRun(ALL, deps), startRun(ALL, deps)])
    expect(first).toHaveProperty('runId')
    expect(second).toEqual({ error: 'busy' })
    expect(await startRun(ALL, deps)).toEqual({ error: 'busy' })
    await waitFor(() => events.find((e) => e.type === 'run:phase' && e.phase === 'booting'))
    expect(deps.spawnCommand).toHaveBeenCalledTimes(1)
    expect(getActiveRun()?.projectPath).toBe(project)
  })

  it.skipIf(process.platform === 'win32')(
    'cancel sends SIGINT and finishes cancelled',
    async () => {
      script = { steps: [{ event: plan('t1') }], hang: true }
      const runId = await run()
      await waitFor(() => events.find((e) => e.type === 'run:planned'))
      await cancelRun(runId)
      const done = await finishedEvent(runId)
      expect(done.status).toBe('cancelled')
      const out = ofRun(runId)
        .map((e) => (e.type === 'run:output' ? e.chunk : ''))
        .join('')
      expect(out).toContain('fake: got SIGINT')
      expect(done.exitCode).toBe(130)
    }
  )

  it.skipIf(process.platform === 'win32')(
    'cancel escalates to SIGKILL after graceMs when SIGINT is ignored',
    async () => {
      script = { steps: [{ event: plan('t1') }], hang: true, ignoreSigint: true }
      const runId = await run()
      await waitFor(() => events.find((e) => e.type === 'run:planned'))
      const cancelledAt = Date.now()
      await cancelRun(runId)
      const done = await finishedEvent(runId)
      expect(Date.now() - cancelledAt).toBeGreaterThanOrEqual(150)
      expect(done.status).toBe('cancelled')
      expect(done.exitCode).toBeNull()
      const out = ofRun(runId)
        .map((e) => (e.type === 'run:output' ? e.chunk : ''))
        .join('')
      expect(out).toContain('fake: got SIGINT')
    }
  )

  const alive = (pid: number): boolean => {
    try {
      process.kill(pid, 0)
      return true
    } catch (error) {
      return (error as NodeJS.ErrnoException).code !== 'ESRCH'
    }
  }

  /** Starts a run whose child leaves a SIGINT-ignoring grandchild in its own process group. */
  const runWithGrandchild = async (): Promise<{ runId: string; grandchild: number }> => {
    const pidFile = path.join(project, 'grandchild.pid')
    script = { steps: [{ event: plan('t1') }], hang: true, ignoreSigint: true, grandchild: pidFile }
    const runId = await run()
    await waitFor(() => events.find((e) => e.type === 'run:planned'))
    const grandchild = Number(fs.readFileSync(pidFile, 'utf8'))
    expect(alive(grandchild)).toBe(true)
    return { runId, grandchild }
  }

  const reap = (pid: number): void => {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      // already gone
    }
  }

  it.skipIf(process.platform === 'win32')(
    'cancel kills a grandchild in its own process group after the grace period',
    async () => {
      const { runId, grandchild } = await runWithGrandchild()
      try {
        await cancelRun(runId)
        const done = await finishedEvent(runId)
        expect(done.status).toBe('cancelled')
        await waitFor(() => (alive(grandchild) ? undefined : true), 2000)
      } finally {
        reap(grandchild)
      }
    }
  )

  it.skipIf(process.platform === 'win32')(
    'killActiveRun kills a grandchild in its own process group',
    async () => {
      deps.graceMs = 10_000
      const { runId, grandchild } = await runWithGrandchild()
      try {
        killActiveRun()
        await finishedEvent(runId, 2000)
        await waitFor(() => (alive(grandchild) ? undefined : true), 2000)
      } finally {
        reap(grandchild)
      }
    }
  )

  it('uses the Gemfile.lock written by the bundle install for the run.json fallback', async () => {
    fs.rmSync(path.join(project, 'Gemfile.lock'))
    deps.ensureBundle = async (projectPath, _r, onInstalling): Promise<{ ok: boolean }> => {
      onInstalling()
      fs.writeFileSync(path.join(projectPath, 'Gemfile.lock'), LIVE_LOCK)
      return { ok: true }
    }
    // Live and planned: counts come from the plan, not run.json (degraded would count the failure)
    script = { steps: [{ event: plan('t1') }, { runJson: ['failed'] }], exitCode: 0 }
    const runId = await run()
    const done = await finishedEvent(runId)
    const sequence = ofRun(runId).filter((e) => e.type === 'run:started' || e.type === 'run:phase')
    expect(sequence[0]).toMatchObject({ type: 'run:started', liveEvents: false })
    expect(sequence[1]).toMatchObject({ type: 'run:phase', phase: 'installing' })
    expect(done.status).toBe('passed')
    expect(done.counts).toMatchObject({ total: 1, failed: 0 })
  })

  it('live mode without a plan finishes like degraded mode', async () => {
    // Reporter 0.11 in the lock but the formatter not loaded: no events at all
    script = { steps: [{ stdout: 'tests ran\n' }], exitCode: 0 }
    const passing = await run()
    expect((await finishedEvent(passing)).status).toBe('passed')

    script = { steps: [], exitCode: 1 }
    const crashed = await run()
    expect((await finishedEvent(crashed)).status).toBe('errored')

    script = { steps: [{ runJson: ['passed', 'failed'] }], exitCode: 1 }
    const failing = await run()
    const done = await finishedEvent(failing)
    expect(done.status).toBe('failed')
    expect(done.counts).toMatchObject({ total: 2, passed: 1, failed: 1 })
  })

  it.skipIf(process.platform === 'win32')('creates the run dirs owner-only', async () => {
    fs.chmodSync(tempRoot, 0o755)
    const runId = await run()
    await finishedEvent(runId)
    expect(fs.statSync(tempRoot).mode & 0o777).toBe(0o700)
    expect(fs.statSync(path.join(tempRoot, runId)).mode & 0o777).toBe(0o700)
  })

  it('checks every requested file against one project listing', async () => {
    vi.mocked(listedFiles).mockClear()
    const files = await run({
      scope: { kind: 'files', files: ['spec/a_spec.rb', 'spec/b_spec.rb'] },
      rubyCommand: 'ruby'
    })
    await finishedEvent(files)
    expect(listedFiles).toHaveBeenCalledTimes(1)
    expect(listedFiles).toHaveBeenCalledWith(['spec/a_spec.rb', 'spec/b_spec.rb'])

    vi.mocked(listedFiles).mockClear()
    const locations = await run({
      scope: { kind: 'locations', locations: ['spec/a_spec.rb:3', 'spec/b_spec.rb:9'] },
      rubyCommand: 'ruby'
    })
    await finishedEvent(locations)
    expect(listedFiles).toHaveBeenCalledTimes(1)
    expect(listedFiles).toHaveBeenCalledWith(['spec/a_spec.rb', 'spec/b_spec.rb'])
  })

  it('degraded mode: liveEvents false, no plan, finishes by exit code', async () => {
    fs.writeFileSync(path.join(project, 'Gemfile.lock'), OLD_LOCK)
    // A stale run.json from an earlier run must not be counted
    fs.mkdirSync(path.join(project, 'raider-results'))
    fs.writeFileSync(
      path.join(project, 'raider-results', 'run.json'),
      JSON.stringify({
        run: { finished_at: '2020-01-01T00:00:00.000Z' },
        results: [{ status: 'failed' }]
      })
    )
    script = { steps: [{ stdout: 'tests ran\n' }], exitCode: 0 }
    const first = await run()
    const stale = await finishedEvent(first)
    expect(ofRun(first)[0]).toMatchObject({ type: 'run:started', liveEvents: false })
    expect(stale.status).toBe('passed')
    expect(stale.counts).toMatchObject({ total: 0, failed: 0 })

    script = {
      steps: [{ runJson: ['passed', 'failed', 'pending', 'quarantined'] }],
      exitCode: 1
    }
    const second = await run()
    const done = await finishedEvent(second)
    expect(ofRun(second).some((e) => e.type === 'run:planned')).toBe(false)
    expect(done.status).toBe('failed')
    expect(done.counts).toEqual({
      total: 4,
      passed: 1,
      failed: 1,
      quarantined: 1,
      pending: 1,
      skipped: 0
    })
  })

  it('rejects an unlisted file and an invalid ruby command without spawning', async () => {
    expect(
      await startRun(
        { scope: { kind: 'files', files: ['spec/secret_spec.rb'] }, rubyCommand: 'ruby' },
        deps
      )
    ).toHaveProperty('error')
    expect(
      await startRun(
        { scope: { kind: 'locations', locations: ['spec/secret_spec.rb:4'] }, rubyCommand: 'ruby' },
        deps
      )
    ).toHaveProperty('error')
    expect(
      await startRun(
        { scope: { kind: 'files', files: ['spec/a_spec.rb'] }, rubyCommand: 'ruby; rm -rf /' },
        deps
      )
    ).toHaveProperty('error')
    expect(
      await startRun({ scope: { kind: 'files', files: [] }, rubyCommand: 'ruby' }, deps)
    ).toHaveProperty('error')
    expect(
      await startRun({ scope: { kind: 'tags', tags: [] }, rubyCommand: 'ruby' }, deps)
    ).toHaveProperty('error')
    expect(
      await startRun({ scope: { kind: 'tags', tags: ['a b'] }, rubyCommand: 'ruby' }, deps)
    ).toHaveProperty('error')
    expect(deps.spawnCommand).not.toHaveBeenCalled()
    expect(events).toEqual([])

    // A listed location is accepted
    script = { steps: [], exitCode: 0 }
    const runId = await run({
      scope: { kind: 'locations', locations: ['spec/a_spec.rb:12'] },
      rubyCommand: 'ruby'
    })
    await finishedEvent(runId)
    expect(deps.spawnCommand.mock.calls[0][0]).toContain("'spec/a_spec.rb:12'")
  })

  it('installing phase is sent only when ensureBundle reports missing gems', async () => {
    const phases = (runId: string): string[] =>
      ofRun(runId).flatMap((e) => (e.type === 'run:phase' ? [e.phase] : []))

    const ready = await run()
    await finishedEvent(ready)
    expect(phases(ready)).not.toContain('installing')

    deps.ensureBundle = async (_p, _r, onInstalling): Promise<{ ok: boolean; error?: string }> => {
      onInstalling()
      return { ok: true }
    }
    const installed = await run()
    await finishedEvent(installed)
    expect(phases(installed).slice(0, 2)).toEqual(['installing', 'booting'])

    deps.ensureBundle = async (_p, _r, onInstalling): Promise<{ ok: boolean; error?: string }> => {
      onInstalling()
      return { ok: false, error: 'Could not find gem rspec' }
    }
    deps.spawnCommand.mockClear()
    const broken = await run()
    const done = await finishedEvent(broken)
    expect(done.status).toBe('errored')
    expect(deps.spawnCommand).not.toHaveBeenCalled()
    expect(
      ofRun(broken).some(
        (e) => e.type === 'run:output' && e.chunk.includes('Could not find gem rspec')
      )
    ).toBe(true)
  })

  it("removes the previous run's temp dir on the next start", async () => {
    const first = await run()
    await finishedEvent(first)
    expect(fs.existsSync(path.join(tempRoot, first))).toBe(true)

    const second = await run()
    await finishedEvent(second)
    expect(fs.existsSync(path.join(tempRoot, first))).toBe(false)
    expect(fs.existsSync(path.join(tempRoot, second))).toBe(true)
  })

  it.skipIf(process.platform === 'win32')(
    'a cancel between exit and run:finished neither changes the status nor signals',
    async () => {
      script = { steps: [{ event: plan('t1') }, { event: finished('t1', 'passed') }], exitCode: 0 }
      const killSpy = vi.spyOn(process, 'kill')
      let runId = ''
      deps.spawnCommand.mockImplementationOnce(
        (cmd: string, cwd: string, env: NodeJS.ProcessEnv) => {
          const child = fakeSpawn(cmd, cwd, env)
          // Registered before the runner's own 'close' listener; the microtask runs after it,
          // while the runner is still draining the tail
          child.on('close', () => queueMicrotask(() => void cancelRun(runId)))
          return child
        }
      )
      try {
        runId = await run()
        const done = await finishedEvent(runId)
        expect(done).toMatchObject({ status: 'passed', exitCode: 0 })
        expect(killSpy).not.toHaveBeenCalled()
      } finally {
        killSpy.mockRestore()
      }
    }
  )

  it.skipIf(process.platform === 'win32')(
    'killActiveRun SIGKILLs the running process group at once',
    async () => {
      expect(() => killActiveRun()).not.toThrow() // no run yet: nothing to kill
      deps.graceMs = 10_000
      script = { steps: [{ event: plan('t1') }], hang: true, ignoreSigint: true }
      const runId = await run()
      await waitFor(() => events.find((e) => e.type === 'run:planned'))
      const killSpy = vi.spyOn(process, 'kill')
      try {
        killActiveRun()
        const pid = deps.spawnCommand.mock.results[0].value.pid
        expect(killSpy).toHaveBeenCalledWith(-pid, 'SIGKILL')
      } finally {
        killSpy.mockRestore()
      }
      const done = await finishedEvent(runId, 2000)
      expect(done.exitCode).toBeNull()
      killActiveRun() // after the run: nothing alive, no throw
    }
  )

  it('rejects a run when the project changes during validation', async () => {
    const other = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-other-'))
    vi.mocked(listedFiles).mockImplementationOnce(async (files: unknown[]) => {
      appState.projectPath = other
      return { projectPath: other, layout: {} as never, files: files as string[] }
    })
    try {
      const result = await startRun(
        { scope: { kind: 'files', files: ['spec/a_spec.rb'] }, rubyCommand: 'ruby' },
        deps
      )
      expect(result).toHaveProperty('error')
      expect(deps.spawnCommand).not.toHaveBeenCalled()
      expect(
        await startRun(ALL, { ...deps, ensureBundle: async () => ({ ok: true }) })
      ).toHaveProperty('runId')
      const active = getActiveRun()!
      await finishedEvent(active.runId)
    } finally {
      appState.projectPath = project
      fs.rmSync(other, { recursive: true, force: true })
    }
  })
})
