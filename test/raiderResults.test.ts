import { describe, it, expect, vi } from 'vitest'
import {
  loadRaiderResults,
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
    expect(rows![1].statusDetails?.message).toBe('boom\na:1\nb:2')
  })

  it('merges run-1.json and run-2.json shards when there is no run.json', async () => {
    const api = makeApi({
      'run-2.json': run([r('F: two', 'passed')]),
      'run-1.json': run([r('F: one', 'failed')])
    })
    const rows = await loadRaiderResults('/proj', api)
    expect(rows!.map((x) => x.name)).toEqual(['F: one', 'F: two'])
  })

  it('prefers run.json when shard files also exist', async () => {
    const api = makeApi({
      'run.json': run([r('F: whole', 'passed')]),
      'run-1.json': run([r('F: stale', 'passed')])
    })
    const rows = await loadRaiderResults('/proj', api)
    expect(rows!.map((x) => x.name)).toEqual(['F: whole'])
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
