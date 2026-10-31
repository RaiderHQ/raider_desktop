import { describe, it, expect } from 'vitest'
import {
  reduceRun,
  progress,
  fileStatus,
  errorReason,
  OUTPUT_CAP,
  type RunView
} from '@foundation/run/runModel'
import type { PlannedTest, RunCounts, RunEvent } from '@shared/types/runEvents'

const runId = 'r1'
const started = (liveEvents = true): RunEvent => ({
  type: 'run:started',
  runId,
  startedAt: '2026-10-31T10:00:00Z',
  framework: 'rspec',
  scope: { kind: 'all' },
  workers: 2,
  liveEvents
})
const planned = (ids: string[], file = 'spec/a_spec.rb', worker?: number): RunEvent => ({
  type: 'run:planned',
  runId,
  worker,
  tests: ids.map(
    (id): PlannedTest => ({ id, file, line: 1, description: id, fullName: `full ${id}` })
  )
})
const example = (
  id: string,
  status: 'started' | 'passed' | 'failed' | 'skipped',
  extra: Partial<Extract<RunEvent, { type: 'run:example' }>> = {}
): RunEvent => ({
  type: 'run:example',
  runId,
  id,
  file: 'spec/a_spec.rb',
  line: 1,
  description: id,
  fullName: `full ${id}`,
  status,
  ...extra
})
const counts = (total: number): RunCounts => ({
  total,
  passed: 0,
  failed: 0,
  quarantined: 0,
  pending: 0,
  skipped: 0
})
const fold = (events: RunEvent[]): RunView =>
  events.reduce<RunView | null>((v, e) => reduceRun(v, e, '/proj'), null) as RunView

describe('runModel', () => {
  it('moves phases from booting to running and keeps the open project', () => {
    let v = fold([started(), { type: 'run:phase', runId, phase: 'booting' }])
    expect(v.phase).toBe('booting')
    expect(v.projectPath).toBe('/proj')
    v = reduceRun(v, { type: 'run:phase', runId, phase: 'running' })!
    expect(v.phase).toBe('running')
  })

  it('grows the plan as workers plan and never lowers the total', () => {
    let v = fold([started(), planned(['a', 'b'], 'spec/a_spec.rb', 1)])
    expect(progress(v)).toEqual({ done: 0, total: 2 })
    v = reduceRun(v, planned(['c', 'd', 'e'], 'spec/b_spec.rb', 2))!
    expect(progress(v)).toEqual({ done: 0, total: 5 })
    v = reduceRun(v, planned(['a']))!
    expect(progress(v).total).toBe(5)
    expect(v.order).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('adds an unplanned example as it arrives', () => {
    const v = fold([started(), planned(['a']), example('z', 'passed')])
    expect(v.order).toEqual(['a', 'z'])
    expect(v.tests.z.state).toBe('passed')
    expect(progress(v)).toEqual({ done: 1, total: 2 })
  })

  it('keeps a result when started arrives after it', () => {
    const v = fold([started(), planned(['a']), example('a', 'passed'), example('a', 'started')])
    expect(v.tests.a.state).toBe('passed')
  })

  it('keeps worker, duration and attempt', () => {
    const v = fold([started(), example('a', 'failed', { attempt: 2, worker: 1, durationMs: 40 })])
    expect(v.tests.a).toMatchObject({ state: 'failed', attempt: 2, worker: 1, durationMs: 40 })
  })

  it('appends output', () => {
    const v = fold([
      started(),
      { type: 'run:output', runId, stream: 'stdout', chunk: 'hi', worker: 1 }
    ])
    expect(v.output).toEqual([{ stream: 'stdout', chunk: 'hi', worker: 1 }])
  })

  it('has no tests in degraded mode and takes the total from the final counts', () => {
    const v = fold([
      started(false),
      {
        type: 'run:finished',
        runId,
        finishedAt: 'x',
        exitCode: 0,
        status: 'passed',
        counts: counts(7)
      }
    ])
    expect(v.liveEvents).toBe(false)
    expect(v.order).toEqual([])
    expect(progress(v)).toEqual({ done: 0, total: 7 })
  })

  it('derives done from the final counts when a finished run has no per-test entries', () => {
    const v = fold([
      started(false),
      {
        type: 'run:finished',
        runId,
        finishedAt: 'x',
        exitCode: 1,
        status: 'failed',
        counts: { ...counts(7), passed: 4, failed: 2, skipped: 1 }
      }
    ])
    expect(progress(v)).toEqual({ done: 7, total: 7 })
  })

  it('turns queued and started tests into skipped when cancelled', () => {
    const cancel: RunEvent = {
      type: 'run:finished',
      runId,
      finishedAt: 'x',
      exitCode: null,
      status: 'cancelled',
      counts: counts(3)
    }
    const v = fold([
      started(),
      planned(['a', 'b', 'c']),
      example('a', 'passed'),
      example('b', 'started'),
      cancel
    ])
    expect(['a', 'b', 'c'].map((id) => v.tests[id].state)).toEqual(['passed', 'skipped', 'skipped'])
    expect(v.finished?.status).toBe('cancelled')
  })

  it('leaves unreported tests as they are when the run errors', () => {
    const v = fold([
      started(),
      planned(['a']),
      {
        type: 'run:finished',
        runId,
        finishedAt: 'x',
        exitCode: 1,
        status: 'errored',
        counts: counts(1)
      }
    ])
    expect(v.tests.a.state).toBe('queued')
  })

  it('ignores a foreign runId but lets run:started replace the view', () => {
    const v = fold([started(), planned(['a'])])
    expect(reduceRun(v, { ...example('b', 'passed'), runId: 'other' })).toBe(v)
    const next = reduceRun(v, { ...started(), runId: 'r2' }, '/other')!
    expect(next.runId).toBe('r2')
    expect(next.order).toEqual([])
  })

  describe('fileStatus', () => {
    it('is null without a run or tests in the file', () => {
      expect(fileStatus(null, 'spec/a_spec.rb')).toBeNull()
      expect(fileStatus(fold([started(), planned(['a'])]), 'spec/none_spec.rb')).toBeNull()
    })

    it('is running while any test is queued or started', () => {
      const v = fold([started(), planned(['a', 'b']), example('a', 'failed')])
      expect(fileStatus(v, 'spec/a_spec.rb')).toBe('running')
    })

    it('is failed if any failed, passed when all passed or skipped', () => {
      expect(
        fileStatus(
          fold([started(), planned(['a', 'b']), example('a', 'failed'), example('b', 'passed')]),
          'spec/a_spec.rb'
        )
      ).toBe('failed')
      expect(
        fileStatus(
          fold([started(), planned(['a', 'b']), example('a', 'skipped'), example('b', 'passed')]),
          'spec/a_spec.rb'
        )
      ).toBe('passed')
    })
  })
})

describe('output cap', () => {
  const out = (chunk: string, stream: 'stdout' | 'stderr' = 'stdout'): RunEvent => ({
    type: 'run:output',
    runId,
    stream,
    chunk
  })

  it('drops the oldest output past the cap and flags it', () => {
    const half = 'x'.repeat(OUTPUT_CAP / 2)
    const v = fold([started(), out('first'), out(half), out(half)])
    expect(v.output.map((o) => o.chunk)).toEqual([half, half])
    expect(v.outputSize).toBe(OUTPUT_CAP)
    expect(v.outputTrimmed).toBe(true)
  })

  it('is not flagged while under the cap', () => {
    const v = fold([started(), out('a'), out('b')])
    expect(v.outputSize).toBe(2)
    expect(v.outputTrimmed).toBe(false)
  })
})

describe('errorReason', () => {
  const withOutput = (output: RunView['output']): RunView =>
    ({ ...fold([started()]), output }) as RunView

  it('takes the first non-blank stderr line, even across chunks', () => {
    const v = withOutput([
      { stream: 'stdout', chunk: 'Installing gems\n' },
      { stream: 'stderr', chunk: '\n   \n  cannot load ' },
      { stream: 'stderr', chunk: 'such file\nmore\n' }
    ])
    expect(errorReason(v)).toBe('cannot load such file')
  })

  it('falls back to the first non-blank stdout line', () => {
    const v = withOutput([
      { stream: 'stdout', chunk: '\n  Could not find gem  \n' },
      { stream: 'stderr', chunk: '  \n' }
    ])
    expect(errorReason(v)).toBe('Could not find gem')
  })

  it('is null without output and caps long lines', () => {
    expect(errorReason(withOutput([]))).toBeNull()
    const reason = errorReason(withOutput([{ stream: 'stderr', chunk: 'e'.repeat(500) }]))
    expect(reason).toHaveLength(200)
  })
})
