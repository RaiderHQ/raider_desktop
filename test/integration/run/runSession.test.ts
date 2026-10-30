// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { RunSession, finishStatus } from '../../../src/main/handlers/run/runSession'
import type { RunCounts, RunEvent } from '../../../src/shared/types/runEvents'

const RID = 'r1'
const zero: RunCounts = { total: 0, passed: 0, failed: 0, quarantined: 0, pending: 0, skipped: 0 }

function make(over: { liveEvents?: boolean; workers?: number } = {}): {
  session: RunSession
  emitted: RunEvent[]
} {
  const emitted: RunEvent[] = []
  const session = new RunSession({
    runId: RID,
    request: { scope: { kind: 'all' }, rubyCommand: 'ruby' },
    projectPath: '/p',
    framework: 'rspec',
    workers: over.workers ?? 1,
    liveEvents: over.liveEvents ?? true,
    emit: (e): void => void emitted.push(e),
    now: (): Date => new Date('2026-01-01T00:00:00.000Z')
  })
  return { session, emitted }
}

const planned = (n: number, worker?: number): RunEvent => ({
  type: 'run:planned',
  runId: RID,
  worker,
  tests: Array.from({ length: n }, (_, i) => ({
    id: `w${worker ?? 0}-${i}`,
    file: 'a_spec.rb',
    line: i + 1,
    description: 'd',
    fullName: 'f'
  }))
})

const example = (
  id: string,
  status: 'started' | 'passed' | 'failed' | 'quarantined'
): RunEvent => ({
  type: 'run:example',
  runId: RID,
  id,
  file: 'a_spec.rb',
  line: 1,
  description: 'd',
  fullName: 'f',
  status
})

const finished = (emitted: RunEvent[]): Extract<RunEvent, { type: 'run:finished' }> =>
  emitted.find((e) => e.type === 'run:finished') as Extract<RunEvent, { type: 'run:finished' }>

describe('RunSession', () => {
  it('emits run:started with the request details', () => {
    const { session, emitted } = make()
    session.start()
    expect(emitted[0]).toMatchObject({
      type: 'run:started',
      runId: RID,
      framework: 'rspec',
      workers: 1,
      liveEvents: true,
      startedAt: '2026-01-01T00:00:00.000Z'
    })
  })

  it('emits phase only on change', () => {
    const { session, emitted } = make()
    session.phase('booting')
    session.phase('booting')
    expect(emitted.filter((e) => e.type === 'run:phase')).toHaveLength(1)
  })

  it('emits running on the first plan only', () => {
    const { session, emitted } = make()
    session.phase('booting')
    session.apply([planned(2, 1)])
    session.apply([planned(3, 2)])
    const phases = emitted
      .filter((e) => e.type === 'run:phase')
      .map((e) => (e as { phase: string }).phase)
    expect(phases).toEqual(['booting', 'running'])
    expect(emitted.filter((e) => e.type === 'run:planned')).toHaveLength(2)
  })

  it('total grows as each worker plans', () => {
    const { session, emitted } = make({ workers: 2 })
    session.apply([planned(2, 1)])
    session.apply([planned(3, 2)])
    session.finish(0)
    expect(finished(emitted).counts.total).toBe(5)
  })

  it('counts the latest status per id under cucumber retry', () => {
    const { session, emitted } = make()
    session.apply([planned(1)])
    session.apply([example('w0-0', 'failed'), example('w0-0', 'passed')])
    session.finish(0)
    expect(finished(emitted).counts).toMatchObject({ total: 1, passed: 1, failed: 0 })
  })

  it('ignores started events for counts but still emits them', () => {
    const { session, emitted } = make()
    session.apply([planned(1), example('w0-0', 'started')])
    expect(emitted.filter((e) => e.type === 'run:example')).toHaveLength(1)
    session.finish(0)
    expect(finished(emitted).counts).toMatchObject({ passed: 0, failed: 0 })
  })

  it('uses the number of results as total when there is no plan', () => {
    const { session, emitted } = make({ liveEvents: false })
    session.apply([example('a', 'passed'), example('b', 'failed')])
    session.finish(1)
    expect(finished(emitted).counts).toMatchObject({ total: 2, passed: 1, failed: 1 })
  })

  it('live mode without a plan finishes like degraded mode', () => {
    const fb: RunCounts = { total: 2, passed: 1, failed: 1, quarantined: 0, pending: 0, skipped: 0 }
    const a = make()
    a.session.finish(1, fb)
    expect(a.session.hasPlan()).toBe(false)
    expect(finished(a.emitted)).toMatchObject({ status: 'failed', counts: fb })
    const b = make()
    b.session.finish(0)
    expect(finished(b.emitted).status).toBe('passed')
  })

  it('uses fallbackCounts only when no example result arrived', () => {
    const fb: RunCounts = { total: 4, passed: 4, failed: 0, quarantined: 0, pending: 0, skipped: 0 }
    const a = make({ liveEvents: false })
    a.session.finish(0, fb)
    expect(finished(a.emitted).counts).toEqual(fb)
    expect(finished(a.emitted).status).toBe('passed')

    const b = make({ liveEvents: false })
    b.session.apply([example('x', 'passed')])
    b.session.finish(0, fb)
    expect(finished(b.emitted).counts.total).toBe(1)
  })

  it('finish is idempotent and cancel yields cancelled', () => {
    const { session, emitted } = make()
    session.apply([planned(1)])
    session.requestCancel()
    session.output('stdout', 'x')
    session.finish(null)
    const n = emitted.length
    session.finish(0)
    session.output('stdout', 'late')
    session.flushOutput()
    expect(emitted).toHaveLength(n)
    expect(finished(emitted).status).toBe('cancelled')
    expect(emitted[n - 1].type).toBe('run:finished')
  })

  it('flushes buffered output in order before run:finished, coalescing by stream and worker', () => {
    const { session, emitted } = make()
    session.output('stdout', 'a')
    session.output('stdout', 'b')
    session.output('stderr', 'c')
    session.flushOutput()
    session.output('stdout', 'd', 2)
    session.finish(0)
    const out = emitted.filter((e) => e.type === 'run:output') as Extract<
      RunEvent,
      { type: 'run:output' }
    >[]
    expect(out.map((o) => [o.stream, o.chunk, o.worker])).toEqual([
      ['stdout', 'ab', undefined],
      ['stderr', 'c', undefined],
      ['stdout', 'd', 2]
    ])
    expect(emitted[emitted.length - 1].type).toBe('run:finished')
  })

  it('trims the oldest output past 2 MB and sets truncated', () => {
    const { session, emitted } = make()
    const mb = 'x'.repeat(1024 * 1024)
    for (const tag of ['A', 'B', 'C']) {
      session.output('stdout', tag + mb.slice(1))
      session.flushOutput()
    }
    session.apply([planned(1)])
    session.finish(0)
    expect(finished(emitted).truncated).toBe(true)
    const snap = session.snapshot()
    const out = snap.events.filter((e) => e.type === 'run:output') as Extract<
      RunEvent,
      { type: 'run:output' }
    >[]
    expect(out.map((o) => o.chunk[0])).toEqual(['B', 'C'])
    expect(snap.events.some((e) => e.type === 'run:planned')).toBe(true)
    expect(emitted.filter((e) => e.type === 'run:output')).toHaveLength(3)
  })

  it('does not set truncated when nothing was trimmed', () => {
    const { session, emitted } = make()
    session.output('stdout', 'hi')
    session.finish(0)
    expect(finished(emitted).truncated).toBeUndefined()
  })

  it('snapshot returns the run identity and events so far', () => {
    const { session } = make()
    session.start()
    const snap = session.snapshot()
    expect(snap).toMatchObject({ runId: RID, projectPath: '/p' })
    expect(snap.events[0].type).toBe('run:started')
  })
})

describe('finishStatus', () => {
  const base = {
    cancelled: false,
    exitCode: 0 as number | null,
    counts: { ...zero, total: 1, passed: 1 },
    quarantinedFails: false
  }
  it.each([
    [
      'cancelled wins',
      { cancelled: true, exitCode: 1, counts: { ...zero, failed: 1 } },
      'cancelled'
    ],
    ['no results and exit 1', { exitCode: 1, counts: zero }, 'errored'],
    ['exit 137 with no results', { exitCode: 137, counts: zero }, 'errored'],
    [
      'exit 1, quarantined only',
      { exitCode: 1, counts: { ...zero, total: 1, quarantined: 1 } },
      'passed'
    ],
    [
      'exit 1, quarantined only, quarantinedFails',
      { exitCode: 1, quarantinedFails: true, counts: { ...zero, total: 1, quarantined: 1 } },
      'failed'
    ],
    ['exit 0 all passed', {}, 'passed'],
    ['exit 1, 1 failed', { exitCode: 1, counts: { ...zero, total: 1, failed: 1 } }, 'failed'],
    ['exit 0 without results (live without a plan, or degraded)', { counts: zero }, 'passed'],
    ['exit 137 after results', { exitCode: 137 }, 'failed'],
    ['null exit without results', { exitCode: null, counts: zero }, 'errored']
  ] as const)('%s', (_name, over, expected) => {
    expect(finishStatus({ ...base, ...over })).toBe(expected)
  })
})
