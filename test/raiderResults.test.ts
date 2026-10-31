import { describe, it, expect, vi } from 'vitest'
import {
  loadRaiderResults,
  mapStatus,
  sanitizeMessage,
  type RaiderResultsApi
} from '@foundation/raiderResults'

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
