import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  loadRaiderResults,
  mapStatus,
  sanitizeMessage,
  type RaiderResultsApi
} from '@foundation/raiderResults'
import type { TestResult } from '@foundation/Types/testResult'

type Files = Record<string, string>

const makeApi = (files: Files, dirNames?: string[]): RaiderResultsApi => {
  const root = '/proj/raider-results'
  return {
    readDirectory: vi.fn(async (dir: string) => {
      if (dir !== root) throw new Error('ENOENT')
      const names = dirNames ?? Object.keys(files)
      if (names.length === 0 && Object.keys(files).length === 0 && !dirNames)
        throw new Error('ENOENT')
      return names.map((name) =>
        name.startsWith('attachments')
          ? { name, isDirectory: true, type: 'folder', children: [] }
          : { name, isDirectory: false, type: 'file', path: `${root}/${name}` }
      )
    }),
    readFile: vi.fn(async (p: string) => {
      const name = p.replace(`${root}/`, '')
      return name in files
        ? { success: true, data: files[name] }
        : { success: false, error: 'missing' }
    })
  }
}

const run = (results: unknown[]): string =>
  JSON.stringify({ schema_version: 1, client_run_id: 'x', run: {}, results })

const r = (
  full_name: string,
  status: string,
  extra: Record<string, unknown> = {}
): Record<string, unknown> => ({
  identifier: `features/a.feature:1`,
  full_name,
  file_path: 'features/a.feature',
  line_number: 1,
  status,
  attachments: [],
  ...extra
})

describe('loadRaiderResults', () => {
  it('maps a single run.json to dashboard rows', async () => {
    const api = makeApi({
      'run.json': run([
        r('F: ok', 'passed'),
        r('F: bad', 'failed', {
          failure: { message: 'boom', exception_class: 'E', backtrace: ['a:1', 'b:2'] }
        }),
        r('F: wip', 'pending'),
        r('F: skip', 'skipped')
      ])
    })
    const rows = await loadRaiderResults('/proj', api)
    expect(rows).toHaveLength(4)
    expect(rows!.map((x) => [x.name, x.status])).toEqual([
      ['F: ok', 'passed'],
      ['F: bad', 'failed'],
      ['F: wip', 'skipped'],
      ['F: skip', 'skipped']
    ])
    expect(rows![1].statusDetails?.message).toBe('boom')
  })

  it('keeps identifier, file_path and line_number', async () => {
    const api = makeApi({
      'run.json': run([
        r('F: ok', 'passed', {
          identifier: 'spec/a_spec.rb[1:1]',
          file_path: './spec/a_spec.rb',
          line_number: 12
        }),
        r('F: bare', 'passed', {
          identifier: 7,
          file_path: null,
          line_number: '3'
        }),
        r('F: gone', 'passed', {
          identifier: undefined,
          file_path: undefined,
          line_number: undefined
        })
      ])
    })
    const rows = (await loadRaiderResults('/proj', api)) ?? []
    expect(rows[0]).toMatchObject({
      identifier: 'spec/a_spec.rb[1:1]',
      file: 'spec/a_spec.rb',
      line: 12
    })
    for (const row of rows.slice(1)) {
      expect(row).not.toHaveProperty('identifier')
      expect(row).not.toHaveProperty('file')
      expect(row).not.toHaveProperty('line')
    }
  })

  it('merges run-1.json and run-2.json shards when there is no run.json', async () => {
    const api = makeApi({
      'run-2.json': run([r('F: two', 'passed')]),
      'run-1.json': run([r('F: one', 'failed')])
    })
    const rows = await loadRaiderResults('/proj', api)
    expect(rows!.map((x) => x.name)).toEqual(['F: one', 'F: two'])
  })

  const timed = (finished_at: string, shard: unknown, results: unknown[]): string =>
    JSON.stringify({
      schema_version: 1,
      run: { finished_at, ...(shard ? { shard } : {}) },
      results
    })
  const sh = (index: number, total: number): unknown => ({ index, total, label: `l#${index}` })

  it('keeps each shard its own finished_at on its rows', async () => {
    const api = makeApi({
      'run-1.json': timed('2026-10-10T12:00:00Z', sh(1, 2), [r('F: s1', 'failed')]),
      'run-2.json': timed('2026-10-10T12:00:01Z', sh(2, 2), [r('F: s2', 'failed')])
    })
    const rows = await loadRaiderResults('/proj', api)
    expect(rows!.map((x) => x.finishedAt)).toEqual(['2026-10-10T12:00:00Z', '2026-10-10T12:00:01Z'])
  })

  it('prefers fresh shards over a stale run.json', async () => {
    const api = makeApi({
      'run.json': timed('2026-10-10T10:00:00Z', null, [r('F: stale', 'passed')]),
      'run-1.json': timed('2026-10-10T12:00:00Z', sh(1, 2), [r('F: s1', 'passed')]),
      'run-2.json': timed('2026-10-10T12:00:01Z', sh(2, 2), [r('F: s2', 'passed')])
    })
    const rows = await loadRaiderResults('/proj', api)
    expect(rows!.map((x) => x.name)).toEqual(['F: s1', 'F: s2'])
  })

  it('prefers a fresh run.json over stale shards', async () => {
    const api = makeApi({
      'run.json': timed('2026-10-10T12:00:00Z', null, [r('F: whole', 'passed')]),
      'run-1.json': timed('2026-10-10T10:00:00Z', sh(1, 2), [r('F: stale', 'passed')])
    })
    const rows = await loadRaiderResults('/proj', api)
    expect(rows!.map((x) => x.name)).toEqual(['F: whole'])
  })

  it('ignores stale shards left over from a run with more shards', async () => {
    const api = makeApi({
      'run-1.json': timed('2026-10-10T12:00:00Z', sh(1, 2), [r('F: s1', 'passed')]),
      'run-2.json': timed('2026-10-10T12:00:01Z', sh(2, 2), [r('F: s2', 'passed')]),
      'run-3.json': timed('2026-10-10T10:00:00Z', sh(3, 4), [r('F: old3', 'passed')]),
      'run-4.json': timed('2026-10-10T10:00:01Z', sh(4, 4), [r('F: old4', 'passed')])
    })
    const rows = await loadRaiderResults('/proj', api)
    expect(rows!.map((x) => x.name)).toEqual(['F: s1', 'F: s2'])
  })

  it('orders shards numerically (run-10 after run-2)', async () => {
    const api = makeApi({
      'run-10.json': run([r('F: ten', 'passed')]),
      'run-2.json': run([r('F: two', 'passed')])
    })
    const rows = await loadRaiderResults('/proj', api)
    expect(rows!.map((x) => x.name)).toEqual(['F: two', 'F: ten'])
  })

  it('uses run.json when timestamps are missing', async () => {
    const api = makeApi({
      'run.json': run([r('F: whole', 'passed')]),
      'run-1.json': run([r('F: shard', 'passed')])
    })
    const rows = await loadRaiderResults('/proj', api)
    expect(rows!.map((x) => x.name)).toEqual(['F: whole'])
  })

  it.each([
    '../x.png',
    '..\\x.png',
    '/etc/x.png',
    'C:\\x.png',
    'attachments/../../x.png',
    'other/x.png'
  ])('rejects unsafe screenshot path %s', async (path) => {
    const api = makeApi({
      'run.json': run([r('F: s', 'failed', { attachments: [{ content_type: 'image/png', path }] })])
    })
    const rows = await loadRaiderResults('/proj', api)
    expect(rows![0].screenshot).toBeUndefined()
  })

  it('accepts a sharded attachment path', async () => {
    const api = makeApi({
      'run-2.json': run([
        r('F: s', 'failed', {
          attachments: [{ content_type: 'image/png', path: 'attachments-2/0-shot.png' }]
        })
      ])
    })
    const rows = await loadRaiderResults('/proj', api)
    expect(rows![0].screenshot).toBe('/proj/raider-results/attachments-2/0-shot.png')
  })

  it('handles a failure without backtrace and unknown statuses', async () => {
    const api = makeApi({
      'run.json': run([
        r('F: bad', 'failed', { failure: { message: 'boom' } }),
        r('F: odd', 'weird')
      ])
    })
    const rows = await loadRaiderResults('/proj', api)
    expect(rows![0].statusDetails?.message).toBe('boom')
    expect(rows![1].status).toBe('skipped')
  })

  it('sanitizes failure messages', async () => {
    const api = makeApi({
      'run.json': run([r('F: bad', 'failed', { failure: { message: 'a\u0000b' } })])
    })
    const rows = await loadRaiderResults('/proj', api)
    expect(rows![0].statusDetails?.message).toBe('ab')
    expect(rows![0].failure?.message).toBe('ab')
  })

  it('reports unreadable files through onError', async () => {
    const api = makeApi({ 'run-1.json': run([r('F: one', 'passed')]) }, [
      'run-1.json',
      'run-2.json'
    ])
    const onError = vi.fn()
    const rows = await loadRaiderResults('/proj', api, onError)
    expect(rows!.map((x) => x.name)).toEqual(['F: one'])
    expect(onError).toHaveBeenCalledWith('run-2.json', 'missing')
  })

  it('returns null when every file is malformed', async () => {
    const api = makeApi({ 'run-1.json': '{bad', 'run-2.json': '[' })
    const onError = vi.fn()
    expect(await loadRaiderResults('/proj', api, onError)).toBeNull()
    expect(onError).toHaveBeenCalledTimes(2)
  })

  it('treats an empty results array as parsed', async () => {
    const api = makeApi({ 'run.json': run([]) })
    expect(await loadRaiderResults('/proj', api)).toEqual([])
  })

  it('sets screenshot from the first image attachment and ignores others', async () => {
    const api = makeApi({
      'run.json': run([
        r('F: shot', 'failed', {
          attachments: [
            { name: 'log', content_type: 'text/plain', path: 'attachments/0-log.txt' },
            { name: 's', content_type: 'image/png', path: 'attachments/1-shot.png' }
          ]
        }),
        r('F: nopic', 'passed', {
          attachments: [{ name: 'log', content_type: 'text/plain', path: 'attachments/0-log.txt' }]
        })
      ])
    })
    const rows = await loadRaiderResults('/proj', api)
    expect(rows![0].screenshot).toBe('/proj/raider-results/attachments/1-shot.png')
    expect(rows![1].screenshot).toBeUndefined()
  })

  it('maps the first video/* attachment to row.video under resultsDir', async () => {
    const api = makeApi({
      'run.json': run([
        r('F: vid', 'failed', {
          attachments: [
            { name: 'v', content_type: 'video/webm', path: 'attachments/0-video.webm' },
            { name: 'v2', content_type: 'video/mp4', path: 'attachments/1-video.mp4' }
          ]
        })
      ])
    })
    const rows = await loadRaiderResults('/proj', api)
    expect(rows![0].video).toBe('/proj/raider-results/attachments/0-video.webm')
  })

  it('ignores a video with an unsafe path', async () => {
    const api = makeApi({
      'run.json': run([
        r('F: vid', 'failed', {
          attachments: [{ name: 'v', content_type: 'video/webm', path: '../../etc/x.webm' }]
        })
      ])
    })
    const rows = await loadRaiderResults('/proj', api)
    expect(rows![0].video).toBeUndefined()
  })

  describe('traces', () => {
    const TRACE = 'application/vnd.raider.trace+zip'
    const trace = (path: string, attempt?: unknown): object => ({
      name: 'trace',
      content_type: TRACE,
      path,
      ...(attempt === undefined ? {} : { attempt })
    })
    const load = async (status: string, attachments: object[]) =>
      loadRaiderResults('/proj', makeApi({ 'run.json': run([r('F: t', status, { attachments })]) }))

    it('adds a trace with its attempt', async () => {
      const rows = await load('failed', [trace('attachments/3-trace.zip', 2)])
      expect(rows![0].traces).toEqual([
        { path: '/proj/raider-results/attachments/3-trace.zip', attempt: 2 }
      ])
    })

    it('orders attempts newest first, attempt-less entries last in file order', async () => {
      const rows = await load('failed', [
        trace('attachments/a.zip', 1),
        trace('attachments/n1.zip'),
        trace('attachments/b.zip', 3),
        trace('attachments/n2.zip'),
        trace('attachments/c.zip', 2)
      ])
      expect(rows![0].traces!.map((t) => t.path.split('/').pop())).toEqual([
        'b.zip',
        'c.zip',
        'a.zip',
        'n1.zip',
        'n2.zip'
      ])
    })

    it('keeps traces on passing results', async () => {
      const rows = await load('passed', [trace('attachments/p.zip', 1)])
      expect(rows![0].traces).toHaveLength(1)
    })

    it('ignores a .zip with another content type', async () => {
      const rows = await load('failed', [
        { name: 'z', content_type: 'application/zip', path: 'attachments/x.zip' }
      ])
      expect(rows![0].traces).toBeUndefined()
    })

    it('ignores an unsafe trace path', async () => {
      const rows = await load('failed', [
        trace('../x.zip'),
        trace('/abs/x.zip'),
        trace('attachments/a/b.zip')
      ])
      expect(rows![0].traces).toBeUndefined()
    })

    it('drops a non-integer or non-positive attempt but keeps the trace', async () => {
      const rows = await load('failed', [
        trace('attachments/a.zip', '2'),
        trace('attachments/b.zip', 0),
        trace('attachments/c.zip', 1.5)
      ])
      expect(rows![0].traces).toEqual([
        { path: '/proj/raider-results/attachments/a.zip' },
        { path: '/proj/raider-results/attachments/b.zip' },
        { path: '/proj/raider-results/attachments/c.zip' }
      ])
    })

    it('has no traces key without traces', async () => {
      const rows = await load('failed', [])
      expect('traces' in rows![0]).toBe(false)
    })
  })

  it('accepts only flat attachments(-N)/<file> paths for screenshots and videos alike', async () => {
    const both = (p: string): object => ({
      attachments: [
        { name: 's', content_type: 'image/png', path: p.replace('.webm', '.png') },
        { name: 'v', content_type: 'video/webm', path: p }
      ]
    })
    const api = makeApi({
      'run.json': run([
        r('F: nested', 'failed', both('attachments/x/0-video.webm')),
        r('F: shard', 'failed', both('attachments-2/0-video.webm')),
        r('F: bare', 'failed', both('attachments'))
      ])
    })
    const rows = await loadRaiderResults('/proj', api)
    expect(rows![0].screenshot).toBeUndefined()
    expect(rows![0].video).toBeUndefined()
    expect(rows![1].screenshot).toBe('/proj/raider-results/attachments-2/0-video.png')
    expect(rows![1].video).toBe('/proj/raider-results/attachments-2/0-video.webm')
    expect(rows![2].screenshot).toBeUndefined()
    expect(rows![2].video).toBeUndefined()
  })

  it('returns null when the folder is missing', async () => {
    expect(await loadRaiderResults('/proj', makeApi({}))).toBeNull()
  })

  it('returns null when the folder has no run files', async () => {
    const api = makeApi({}, ['attachments', 'notes.txt'])
    expect(await loadRaiderResults('/proj', api)).toBeNull()
  })

  it('skips malformed files and reports them through onError', async () => {
    const api = makeApi({
      'run-1.json': '{not json',
      'run-2.json': run([r('F: two', 'passed')])
    })
    const onError = vi.fn()
    const rows = await loadRaiderResults('/proj', api, onError)
    expect(rows!.map((x) => x.name)).toEqual(['F: two'])
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0][0]).toBe('run-1.json')
    expect(typeof onError.mock.calls[0][1]).toBe('string')
  })
})

describe('sanitizeMessage', () => {
  it('strips control chars and caps at 20000 characters', () => {
    expect(sanitizeMessage('a\x00b�c')).toBe('abc')
    const out = sanitizeMessage('x'.repeat(30000))
    expect(out.length).toBeLessThan(20100)
    expect(out.endsWith('(message truncated)')).toBe(true)
  })
})

describe('mapStatus', () => {
  it('keeps passed, failed and quarantined and maps everything else to skipped', () => {
    const statuses = ['passed', 'failed', 'quarantined', 'pending', 'skipped', 'weird', undefined]
    expect(statuses.map((s) => mapStatus(s))).toEqual([
      'passed',
      'failed',
      'quarantined',
      'skipped',
      'skipped',
      'skipped',
      'skipped'
    ])
  })
})

describe('loadRaiderResults with schema 2', () => {
  it('keeps a quarantined result with its failure message', async () => {
    const api = makeApi({
      'run.json': JSON.stringify({
        schema_version: 2,
        client_run_id: 'x',
        run: {},
        results: [
          r('F: flaky', 'quarantined', { failure: { message: 'timeout', backtrace: ['a:1'] } }),
          r('F: ok', 'passed')
        ]
      })
    })
    const rows = await loadRaiderResults('/proj', api)
    expect(rows!.map((x) => [x.name, x.status])).toEqual([
      ['F: flaky', 'quarantined'],
      ['F: ok', 'passed']
    ])
    expect(rows![0].statusDetails?.message).toBe('timeout')
  })

  it('survives a malformed run.json', async () => {
    const api = makeApi({
      'run.json': JSON.stringify({
        schema_version: 2,
        client_run_id: 'x',
        run: {},
        results: [
          null,
          'str',
          7,
          r('F: bad', 'failed', {
            failure: {
              message: 'm',
              backtrace: [{ x: 1 }, 'a:1', 3],
              app_frame: {},
              exception_class: 5
            },
            attachments: [null, 'x', { content_type: 5, path: {} }]
          }),
          r('F: nofailure', 'failed', { failure: 'oops' })
        ]
      })
    })
    const rows = await loadRaiderResults('/proj', api)
    expect(rows!.map((x) => x.name)).toEqual(['F: bad', 'F: nofailure'])
    expect(rows![0].failure).toEqual({
      message: 'm',
      exceptionClass: undefined,
      backtrace: ['a:1'],
      appFrame: undefined
    })
    expect(rows![1].failure).toBeUndefined()
    const api2 = makeApi({ 'run.json': JSON.stringify({ run: {}, results: { a: 1 } }) })
    expect(await loadRaiderResults('/proj', api2)).toEqual([])
  })

  describe('failure details', () => {
    const one = async (
      result: Record<string, unknown>,
      runObj: Record<string, unknown> = {}
    ): Promise<import('@foundation/Types/testResult').TestResult> => {
      const api = makeApi({
        'run.json': JSON.stringify({ schema_version: 1, run: runObj, results: [result] })
      })
      return (await loadRaiderResults('/proj', api))![0]
    }

    it('carries the file run.finished_at as finishedAt', async () => {
      const row = await one(r('F: bad', 'failed'), { finished_at: '2026-11-02T10:00:00Z' })
      expect(row.finishedAt).toBe('2026-11-02T10:00:00Z')
    })

    it('has no finishedAt without a run time', async () => {
      const row = await one(r('F: bad', 'failed'))
      expect(row).not.toHaveProperty('finishedAt')
    })

    it('passes failure, appFrame, backtrace and durationMs through', async () => {
      const row = await one(
        r('F: bad', 'failed', {
          duration_ms: 1234,
          failure: {
            message: 'boom',
            exception_class: 'E',
            backtrace: ['a:1', 'b:2'],
            app_frame: 'spec/a_spec.rb:12:in x'
          }
        })
      )
      expect(row.failure).toEqual({
        message: 'boom',
        exceptionClass: 'E',
        backtrace: ['a:1', 'b:2'],
        appFrame: 'spec/a_spec.rb:12:in x'
      })
      expect(row.durationMs).toBe(1234)
    })

    it('gives an empty backtrace and no appFrame when the failure has none', async () => {
      const row = await one(r('F: bad', 'failed', { failure: { message: 'boom' } }))
      expect(row.failure?.backtrace).toEqual([])
      expect(row.failure?.appFrame).toBeUndefined()
    })

    it('reads browser from run.environment and leaves it undefined when absent', async () => {
      const withBrowser = await one(r('a', 'passed'), { environment: { browser: 'chrome' } })
      expect(withBrowser.browser).toBe('chrome')
      const without = await one(r('a', 'passed'))
      expect(without.browser).toBeUndefined()
    })

    it('prefers the attachment named screenshot over an earlier image', async () => {
      const row = await one(
        r('a', 'failed', {
          attachments: [
            { name: 'other', content_type: 'image/png', path: 'attachments/other.png' },
            { name: 'screenshot', content_type: 'image/png', path: 'attachments/shot.png' }
          ]
        })
      )
      expect(row.screenshot).toBe('/proj/raider-results/attachments/shot.png')
    })
  })
})

describe('comparisons', () => {
  const att = (
    name: string,
    path: string,
    content_type = 'image/png'
  ): Record<string, unknown> => ({
    name,
    content_type,
    path
  })
  const cmp = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
    name: 'home',
    status: 'failed',
    baseline: 'screenshots/baselines/chrome/home.png',
    diff_pixels: 10,
    diff_ratio: 0.5,
    threshold: 0.2,
    max_diff_pixels: 0,
    max_diff_ratio: null,
    expected_size: [10, 20],
    actual_size: [10, 20],
    ...extra
  })
  const load = async (result: Record<string, unknown>): Promise<TestResult> => {
    const rows = await loadRaiderResults('/proj', makeApi({ 'run.json': run([result]) }))
    return rows![0]
  }
  const trio = [
    att('comparison:home:expected', 'attachments/0-e.png'),
    att('comparison:home:actual', 'attachments/1-a.png'),
    att('comparison:home:diff', 'attachments/2-d.png')
  ]

  it('reads the gem 3.15 fixture', async () => {
    const json = readFileSync(
      resolve(__dirname, 'fixtures/results/run-v1-comparisons.json'),
      'utf8'
    )
    const rows = await loadRaiderResults('/proj', makeApi({ 'run.json': json }))
    expect(rows).toHaveLength(1)
    expect(rows![0].comparisons![0]).toMatchObject({
      name: 'home',
      status: 'failed',
      baseline: 'screenshots/baselines/chrome/home.png',
      diffPixels: 1797705,
      maxDiffPixels: 0,
      maxDiffRatio: null,
      expectedSize: [1920, 937],
      actualSize: [1920, 937],
      images: {
        expected: '/proj/raider-results/attachments/0-expected.png',
        actual: '/proj/raider-results/attachments/1-actual.png',
        diff: '/proj/raider-results/attachments/2-diff.png'
      }
    })
    expect(rows![0].screenshot).toMatch(/attachments\/3-matches home\.png$/)
  })

  it('does not throw on malformed attachment names or a non-array comparisons field', async () => {
    for (const name of [5, {}, [], null]) {
      const row = await load(
        r('a', 'failed', {
          comparisons: [cmp()],
          attachments: [{ name, content_type: 'image/png', path: 'attachments/x.png' }, ...trio]
        })
      )
      expect(row.screenshot).toBe('/proj/raider-results/attachments/x.png')
      expect(row.comparisons![0].images.actual).toBe('/proj/raider-results/attachments/1-a.png')
    }
    const missing = await load(
      r('a', 'failed', {
        comparisons: [cmp()],
        attachments: [{ name: 'comparison:home:actual', content_type: 'image/png' }]
      })
    )
    expect(missing.comparisons![0].images.actual).toBeUndefined()
    for (const comparisons of [{}, 'x', 3, null]) {
      const row = await load(r('a', 'failed', { comparisons }))
      expect(row.comparisons).toBeUndefined()
    }
  })

  it('never picks a comparison image as the main screenshot', async () => {
    const only = await load(r('a', 'failed', { comparisons: [cmp()], attachments: trio }))
    expect(only.screenshot).toBeUndefined()
    const withOther = await load(
      r('a', 'failed', {
        comparisons: [cmp()],
        attachments: [...trio, att('other', 'attachments/3-other.png')]
      })
    )
    expect(withOther.screenshot).toBe('/proj/raider-results/attachments/3-other.png')
  })

  it('takes the last attachment of a name', async () => {
    const row = await load(
      r('a', 'failed', {
        comparisons: [cmp()],
        attachments: [
          att('comparison:home:actual', 'attachments/1-a.png'),
          att('comparison:home:actual', 'attachments-2/1-a.png')
        ]
      })
    )
    expect(row.comparisons![0].images.actual).toBe('/proj/raider-results/attachments-2/1-a.png')
  })

  it('drops malformed entries and nulls bad fields', async () => {
    const row = await load(
      r('a', 'failed', {
        comparisons: [
          cmp({ name: 'bad-status', status: 'weird' }),
          cmp({ name: 5 }),
          cmp({ name: '../x' }),
          cmp({ name: 'has space' }),
          cmp({ name: 'a'.repeat(101) }),
          'nope',
          null,
          cmp({
            name: 'ok',
            max_diff_ratio: -1,
            expected_size: [1, 'x'],
            baseline: 'b'.repeat(301),
            diff_pixels: Infinity,
            threshold: 'x'
          })
        ]
      })
    )
    expect(row.comparisons).toHaveLength(1)
    expect(row.comparisons![0]).toMatchObject({
      name: 'ok',
      maxDiffRatio: null,
      expectedSize: null,
      baseline: null,
      diffPixels: null,
      threshold: null,
      actualSize: [10, 20]
    })
  })

  it('caps at 50', async () => {
    const many = Array.from({ length: 60 }, (_, i) => cmp({ name: `n${i}` }))
    const row = await load(r('a', 'failed', { comparisons: many }))
    expect(row.comparisons).toHaveLength(50)
  })

  it('ignores unsafe image paths', async () => {
    const row = await load(
      r('a', 'failed', {
        comparisons: [cmp()],
        attachments: [
          att('comparison:home:diff', '../x.png'),
          att('comparison:home:actual', 'attachments/1-a.png')
        ]
      })
    )
    expect(row.comparisons![0].images.diff).toBeUndefined()
    expect(row.comparisons![0].images.actual).toBe('/proj/raider-results/attachments/1-a.png')
  })

  it('has no comparisons without the field', async () => {
    const row = await load(r('a', 'passed'))
    expect(row.comparisons).toBeUndefined()
  })
})

describe("loadRaiderResults from a flow run's folder", () => {
  const DIR = 'flow-results/hello/20261110T110856Z'
  const flowApi = (): RaiderResultsApi => ({
    readDirectory: vi.fn(async (dir: string) => {
      if (dir !== `/proj/${DIR}`) throw new Error('ENOENT')
      return [{ name: 'run.json', type: 'file', path: `/proj/${DIR}/run.json` }]
    }),
    readFile: vi.fn(async () => ({
      success: true,
      data: run([
        r('Hello', 'failed', {
          file_path: 'flows/hello_flow.rb',
          failure: { message: 'boom', backtrace: [] },
          attachments: [
            { name: 'screenshot', content_type: 'image/png', path: 'attachments/0-runs.png' }
          ]
        })
      ])
    }))
  })

  it('reads the folder, joins attachments onto it and marks each row with it', async () => {
    const api = flowApi()
    const rows = await loadRaiderResults('/proj', api, undefined, DIR)
    expect(api.readDirectory).toHaveBeenCalledWith(`/proj/${DIR}`)
    expect(rows).toHaveLength(1)
    expect(rows![0]).toMatchObject({
      status: 'failed',
      file: 'flows/hello_flow.rb',
      screenshot: `/proj/${DIR}/attachments/0-runs.png`,
      resultsDir: DIR
    })
  })

  it.each([
    'flow-results/hello/../../etc',
    'flow-results/Hello/20261110T110856Z',
    'flow-results/hello/latest',
    '/etc',
    'other-results',
    'flow-results/hello/20261110T110856Z/attachments'
  ])('reads nothing for the folder %s', async (dir) => {
    const api = flowApi()
    expect(await loadRaiderResults('/proj', api, undefined, dir)).toBeNull()
    expect(api.readDirectory).not.toHaveBeenCalled()
  })

  it('leaves raider-results rows unmarked', async () => {
    const rows = await loadRaiderResults('/proj', makeApi({ 'run.json': run([r('F', 'passed')]) }))
    expect(rows![0]).not.toHaveProperty('resultsDir')
  })
})
