import fs from 'fs'
import path from 'path'
import { describe, it, expect } from 'vitest'
import { parseTraceIndex } from '../src/shared/trace/parseTraceIndex'

// A real ruby_raider 3.14 trace (raider_planning fixtures/trace-v1-mocked):
// one real request, one answered by a mock, one failed by a mock.
const DIR = path.join(__dirname, 'fixtures', 'trace-v1-mocked', 'unzipped')

function mockedFixture(): ReturnType<typeof parseTraceIndex> {
  const json = JSON.parse(fs.readFileSync(path.join(DIR, 'trace.json'), 'utf8'))
  const steps = fs.readdirSync(path.join(DIR, 'steps')).map((n) => `steps/${n}`)
  return parseTraceIndex(json, new Set(['trace.json', ...steps]))
}

describe('parseTraceIndex with a gem 3.14 trace that has mocked requests', () => {
  it('reads the mocked outcome per request and leaves the real one unmarked', () => {
    const result = mockedFixture()
    if (!result.ok) throw new Error(`fixture did not parse: ${result.error}`)
    const byPath = Object.fromEntries(result.index.network.map((n) => [new URL(n.url).pathname, n]))
    expect(byPath['/mock'].mocked).toBeNull()
    expect(byPath['/api/users']).toMatchObject({ mocked: 'fulfilled', status: 200 })
    expect(byPath['/api/fail']).toMatchObject({ mocked: 'failed', status: null })
    expect(result.index.network).toHaveLength(3)
  })
})
