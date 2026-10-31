import type { ElectronApplication } from '@playwright/test'
import type { RunEvent, RunRequest, StartRunResult } from '../../src/shared/types/runEvents'

export interface RunScript {
  events: RunEvent[]
  /** Delay between scripted events; default 50 ms. */
  stepMs?: number
  /** Returned by start-run instead of starting the script, e.g. { error: 'busy' }. */
  startResult?: StartRunResult
}

/**
 * Replace the main process's live runner with a scripted one. start-run records
 * the request and plays the script's events on 'run-event', stamped with the
 * runId it returns; cancel-run stops the script and finishes the run as
 * cancelled; get-active-run returns the events so far. Calling it again swaps
 * the script for the next run and keeps the requests recorded so far.
 */
export async function mockRunner(app: ElectronApplication, script: RunScript): Promise<void> {
  await app.evaluate(({ ipcMain, BrowserWindow }, json) => {
    const { events, stepMs, startResult } = JSON.parse(json) as RunScript
    const g = global as any
    const previous = g.__RUN_MOCK__
    if (previous?.timer) clearTimeout(previous.timer)
    const mock = {
      requests: (previous?.requests ?? []) as unknown[],
      runs: previous?.runs ?? 0,
      active: null as null | { runId: string; request: unknown; events: unknown[] },
      timer: null as ReturnType<typeof setTimeout> | null
    }
    g.__RUN_MOCK__ = mock

    const send = (e: Record<string, unknown>): void => {
      mock.active?.events.push(e)
      for (const win of BrowserWindow.getAllWindows()) win.webContents.send('run-event', e)
    }

    ipcMain.removeHandler('start-run')
    ipcMain.handle('start-run', (_event, request) => {
      mock.requests.push(request)
      if (startResult) return startResult
      mock.runs += 1
      const runId = `run-${mock.runs}`
      mock.active = { runId, request, events: [] }
      let index = 0
      const next = (): void => {
        if (index >= events.length) {
          mock.timer = null
          return
        }
        send({ ...events[index++], runId })
        mock.timer = setTimeout(next, stepMs ?? 50)
      }
      mock.timer = setTimeout(next, stepMs ?? 50)
      return { runId }
    })

    ipcMain.removeHandler('cancel-run')
    ipcMain.handle('cancel-run', (_event, runId: string) => {
      if (!mock.active || mock.active.runId !== runId) return
      if (mock.timer) clearTimeout(mock.timer)
      mock.timer = null
      send({
        type: 'run:finished',
        runId,
        finishedAt: new Date().toISOString(),
        exitCode: null,
        status: 'cancelled',
        counts: { total: 0, passed: 0, failed: 0, quarantined: 0, pending: 0, skipped: 0 }
      })
    })

    ipcMain.removeHandler('get-active-run')
    ipcMain.handle('get-active-run', () =>
      mock.active ? { ...mock.active, projectPath: '', events: [...mock.active.events] } : null
    )

    ipcMain.removeHandler('get-run-defaults')
    ipcMain.handle('get-run-defaults', () => ({ recommendedWorkers: 2, maxWorkers: 4 }))
  }, JSON.stringify(script))
}

/** Every request start-run received, oldest first. */
export async function getStartRequests(app: ElectronApplication): Promise<RunRequest[]> {
  return app.evaluate(() => (global as any).__RUN_MOCK__?.requests ?? [])
}

/** Send one more event of the scripted run, e.g. to finish it when the test is ready. */
export async function sendRunEvent(app: ElectronApplication, event: RunEvent): Promise<void> {
  await app.evaluate(({ BrowserWindow }, json) => {
    const active = (global as any).__RUN_MOCK__?.active
    const e = { ...JSON.parse(json), runId: active?.runId }
    active?.events.push(e)
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send('run-event', e)
  }, JSON.stringify(event))
}

// ─── Event builders (runId is stamped by the mock) ──────────

const RUN_ID = 'scripted'

export const started = (
  overrides: Partial<Extract<RunEvent, { type: 'run:started' }>> = {}
): RunEvent => ({
  type: 'run:started',
  runId: RUN_ID,
  startedAt: new Date().toISOString(),
  framework: 'rspec',
  scope: { kind: 'all' },
  workers: 1,
  liveEvents: true,
  ...overrides
})

export const phase = (p: 'installing' | 'booting' | 'running'): RunEvent => ({
  type: 'run:phase',
  runId: RUN_ID,
  phase: p
})

export interface ScriptedTest {
  id: string
  file: string
  line: number
  description: string
}

export const planned = (tests: ScriptedTest[]): RunEvent => ({
  type: 'run:planned',
  runId: RUN_ID,
  tests: tests.map((t) => ({ ...t, fullName: t.description }))
})

export const example = (t: ScriptedTest, status: 'started' | 'passed' | 'failed'): RunEvent => ({
  type: 'run:example',
  runId: RUN_ID,
  ...t,
  fullName: t.description,
  status,
  ...(status === 'started' ? {} : { durationMs: 120 })
})

export const output = (chunk: string): RunEvent => ({
  type: 'run:output',
  runId: RUN_ID,
  stream: 'stdout',
  chunk
})

export const finished = (
  status: 'passed' | 'failed' | 'errored' | 'cancelled',
  counts: { total: number; passed?: number; failed?: number }
): RunEvent => ({
  type: 'run:finished',
  runId: RUN_ID,
  finishedAt: new Date().toISOString(),
  exitCode: status === 'passed' ? 0 : 1,
  status,
  counts: {
    total: counts.total,
    passed: counts.passed ?? 0,
    failed: counts.failed ?? 0,
    quarantined: 0,
    pending: 0,
    skipped: 0
  }
})
