import { describe, it, expect } from 'vitest'
import { failedLocations } from '@foundation/run/rerunLocations'
import type { RunView, RunTestView } from '@foundation/run/runModel'
import type { TestResult } from '@foundation/Types/testResult'

const test = (id: string, file: string, line: number | null, state = 'failed'): RunTestView => ({
  id,
  file,
  line,
  description: id,
  fullName: id,
  state: state as RunTestView['state']
})

const runWith = (
  tests: RunTestView[],
  failed = tests.filter((t) => t.state === 'failed').length
): RunView => ({
  runId: 'r',
  projectPath: '/p',
  scope: { kind: 'all' },
  framework: 'rspec',
  workers: 1,
  liveEvents: true,
  startedAt: 't',
  phase: null,
  tests: Object.fromEntries(tests.map((t) => [t.id, t])),
  order: tests.map((t) => t.id),
  output: [],
  finished: {
    status: 'failed',
    counts: { total: tests.length, passed: 0, failed, quarantined: 0, pending: 0, skipped: 0 },
    exitCode: 1,
    finishedAt: 't'
  }
})

const result = (file: string | undefined, line?: number, status = 'failed'): TestResult => ({
  name: 'n',
  status,
  file,
  line
})

describe('failedLocations', () => {
  it('uses the store failures', () => {
    expect(
      failedLocations(
        runWith([test('a', 'spec/a_spec.rb', 12), test('b', 'spec/b_spec.rb', 1, 'passed')]),
        null
      )
    ).toEqual(['spec/a_spec.rb:12'])
  })
  it('gives the bare file for a null line and drops its file:line', () => {
    const run = runWith([test('a', 'spec/a_spec.rb', null), test('b', 'spec/a_spec.rb', 30)])
    expect(failedLocations(run, null)).toEqual(['spec/a_spec.rb'])
  })
  it('falls back to results for a degraded run', () => {
    const run = runWith([], 2)
    expect(
      failedLocations(run, [result('spec/a_spec.rb', 5), result('spec/b_spec.rb', 6, 'passed')])
    ).toEqual(['spec/a_spec.rb:5'])
  })
  it('falls back to results when a test has an empty file', () => {
    const run = runWith([test('a', '', 3)])
    expect(failedLocations(run, [result('spec/c_spec.rb', 9)])).toEqual(['spec/c_spec.rb:9'])
  })
  it('is empty with no failures anywhere', () => {
    expect(failedLocations(runWith([test('a', 'spec/a_spec.rb', 1, 'passed')], 0), [])).toEqual([])
    expect(failedLocations(null, null)).toEqual([])
  })
  it.each(['cancelled', 'errored'] as const)(
    'falls back to results when a run is %s with no failures recorded',
    (status) => {
      const run = runWith([], 0)
      run.finished = { ...run.finished!, status }
      expect(failedLocations(run, [result('spec/a_spec.rb', 5)])).toEqual(['spec/a_spec.rb:5'])
    }
  )
  it('falls back to results while the run is unfinished', () => {
    const run = { ...runWith([test('a', 'spec/a_spec.rb', 1)]), finished: null }
    expect(failedLocations(run, [result('spec/b_spec.rb', 2)])).toEqual(['spec/b_spec.rb:2'])
  })
  it('falls back to results with no run', () => {
    expect(failedLocations(null, [result('spec/b_spec.rb', 2)])).toEqual(['spec/b_spec.rb:2'])
  })
  it('removes duplicates', () => {
    const run = runWith([test('a', 'spec/a_spec.rb', 4), test('b', 'spec/a_spec.rb', 4)])
    expect(failedLocations(run, null)).toEqual(['spec/a_spec.rb:4'])
  })
})
