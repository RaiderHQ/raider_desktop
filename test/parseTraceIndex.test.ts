import { describe, it, expect } from 'vitest'
import { parseTraceIndex } from '../src/shared/trace/parseTraceIndex'
import { fixtureIndex, fixtureJson, fixtureEntryNames } from './helpers/traceFixture'

type Json = Record<string, any>

function parse(json: unknown, names: ReadonlySet<string> = fixtureEntryNames()) {
  return parseTraceIndex(json, names)
}

function parseOk(json: unknown, names?: ReadonlySet<string>) {
  const r = parse(json, names)
  if (!r.ok) throw new Error(`expected ok, got ${r.error}`)
  return r.index
}

function withSteps(steps: Json[]): Json {
  return { ...fixtureJson(), steps }
}

const step = (index: number, extra: Json = {}): Json => ({
  index,
  parent_index: null,
  kind: 'action',
  action: 'click',
  ...extra
})

describe('parseTraceIndex', () => {
  it('parses the fixture', () => {
    const index = fixtureIndex()
    expect(index.steps).toHaveLength(10)
    expect(index.network).toHaveLength(3)
    expect(index.console).toHaveLength(1)
    expect(index.devicePixelRatio).toBe(1)
    expect(index.test.fullName).toBe('Trace replay fails after driving the page')
    expect(index.test.attempt).toBe(1)
    expect(index.test.error?.className).toBe('RSpec::Expectations::ExpectationNotMetError')
    const byIndex = (i: number) => index.steps.find((s) => s.index === i)!
    expect(byIndex(8).parentIndex).toBe(7)
    expect(byIndex(2).screenshot).toBe('steps/0002.jpg')
    expect(byIndex(4).element).toBeNull()
    expect(byIndex(4).screenshot).toBeNull()
  })

  it('notTrace for a wrong or missing format', () => {
    expect(parse({ ...fixtureJson(), format: 'other' })).toEqual({ ok: false, error: 'notTrace' })
    const { format: _f, ...rest } = fixtureJson()
    expect(parse(rest)).toEqual({ ok: false, error: 'notTrace' })
  })

  it('notTrace for a missing, string or 1.5 version', () => {
    const { version: _v, ...rest } = fixtureJson()
    expect(parse(rest)).toEqual({ ok: false, error: 'notTrace' })
    expect(parse({ ...fixtureJson(), version: '1' })).toEqual({ ok: false, error: 'notTrace' })
    expect(parse({ ...fixtureJson(), version: 1.5 })).toEqual({ ok: false, error: 'notTrace' })
  })

  it('notTrace for version 0', () => {
    expect(parse({ ...fixtureJson(), version: 0 })).toEqual({ ok: false, error: 'notTrace' })
  })

  it('notTrace for a non-object', () => {
    for (const v of [null, 1, 'x', true, [], [fixtureJson()], undefined]) {
      expect(parse(v)).toEqual({ ok: false, error: 'notTrace' })
    }
  })

  it('newerVersion for version 2', () => {
    expect(parse({ ...fixtureJson(), version: 2 })).toEqual({ ok: false, error: 'newerVersion' })
  })

  it('ignores unknown fields', () => {
    const json = fixtureJson() as Json
    json.foo = 1
    json.steps[0].foo = 1
    const index = parseOk(json)
    expect('foo' in index).toBe(false)
    expect('foo' in index.steps[0]).toBe(false)
  })

  it('keeps unknown kind, action, strategy and level values', () => {
    const json = fixtureJson() as Json
    json.steps = [
      step(1, { kind: 'teleport', action: 'tap', locator: { strategy: 'relative', selector: 'x' } })
    ]
    json.console = [{ step_index: 1, level: 'verbose', text: 'hi' }]
    const index = parseOk(json)
    expect(index.steps[0].kind).toBe('teleport')
    expect(index.steps[0].action).toBe('tap')
    expect(index.steps[0].locator?.strategy).toBe('relative')
    expect(index.console[0].level).toBe('verbose')
  })

  it('forces value null on a secret step', () => {
    const index = parseOk(withSteps([step(1, { value: 'hunter2', secret: true })]))
    expect(index.steps[0].value).toBeNull()
    expect(index.steps[0].secret).toBe(true)
  })

  it('keeps a plain value', () => {
    const s = fixtureIndex().steps.find((x) => x.index === 5)!
    expect(s.value).toBe('plain-trace-name')
    expect(s.secret).toBe(false)
  })

  it('keeps a screenshot or snapshot only when it names an allowed entry that exists', () => {
    const names = new Set([...fixtureEntryNames(), 'steps/0002.html'])
    const cases: [string, string][] = [
      ['screenshot', 'steps/0099.jpg'],
      ['screenshot', 'trace.json'],
      ['screenshot', '../x.jpg'],
      ['screenshot', 'steps/0002.html'],
      ['snapshot', 'steps/0002.jpg']
    ]
    for (const [field, value] of cases) {
      const index = parseOk(withSteps([step(1, { [field]: value })]), names)
      expect((index.steps[0] as any)[field], `${field}=${value}`).toBeNull()
    }
    const ok = parseOk(
      withSteps([step(1, { screenshot: 'steps/0002.jpg', snapshot: 'steps/0002.html' })]),
      names
    )
    expect(ok.steps[0].screenshot).toBe('steps/0002.jpg')
    expect(ok.steps[0].snapshot).toBe('steps/0002.html')
  })

  it('keeps cucumber_step names', () => {
    const index = parseOk(
      withSteps([
        step(1, { kind: 'group', action: 'cucumber_step', name: 'When I log in as admin' }),
        step(2, { name: 'nope' })
      ])
    )
    expect(index.steps[0].name).toBe('When I log in as admin')
    expect('name' in index.steps[1]).toBe(false)
  })

  it('keeps locator.within, outermost first', () => {
    const within = [
      { strategy: 'css', selector: '.outer' },
      { strategy: 'id', selector: 'inner' }
    ]
    const index = parseOk(
      withSteps([
        step(1, { locator: { strategy: 'id', selector: 'x', within } }),
        step(2, { locator: { strategy: 'id', selector: 'y' } })
      ])
    )
    expect(index.steps[0].locator?.within).toEqual(within)
    expect(index.steps[1].locator?.within).toEqual([])
  })

  it('defaults', () => {
    const json = fixtureJson() as Json
    json.capabilities = { network: false }
    delete json.truncated
    json.device_pixel_ratio = 0
    const index = parseOk(json)
    expect(index.capabilities.network).toBe(false)
    expect(index.capabilities.console).toBe(true)
    expect(index.truncated).toEqual({ steps: 0, screenshots: 0, snapshots: 0, network: 0, console: 0 })
    expect(index.devicePixelRatio).toBe(1)

    json.truncated = { steps: -3, screenshots: 'x', snapshots: 2 }
    json.device_pixel_ratio = 2
    const again = parseOk(json)
    expect(again.truncated.steps).toBe(0)
    expect(again.truncated.screenshots).toBe(0)
    expect(again.truncated.snapshots).toBe(2)
    expect(again.devicePixelRatio).toBe(2)
  })

  describe('step tree', () => {
    const group = (i: number, p: number | null = null) => step(i, { kind: 'group', parent_index: p })

    it('keeps a valid parent', () => {
      const index = parseOk(withSteps([group(1), step(2, { parent_index: 1 })]))
      expect(index.steps[1].parentIndex).toBe(1)
    })

    it.each([
      ['a missing step', [group(1), step(2, { parent_index: 99 })]],
      ['a later step', [group(1), step(2, { parent_index: 3 }), group(3)]],
      ['itself', [group(1), group(2, 2)]],
      ['a non-group step', [step(1), step(2, { parent_index: 1 })]]
    ])('parent naming %s goes top-level and loses no step', (_n, steps) => {
      const index = parseOk(withSteps(steps as Json[]))
      expect(index.steps).toHaveLength(steps.length)
      const bad = index.steps.find((s) => s.index === 2)!
      expect(bad.parentIndex).toBeNull()
    })

    it('breaks a two-step cycle', () => {
      const index = parseOk(withSteps([group(1, 2), group(2, 1)]))
      expect(index.steps.map((s) => s.parentIndex)).toEqual([null, 1])
    })
  })

  it('drops non-object steps and duplicate indices, keeping the first', () => {
    const index = parseOk(
      withSteps([step(1, { action: 'first' }), 'x' as any, null as any, 4 as any, step(1, { action: 'dup' }), step(2)])
    )
    expect(index.steps.map((s) => s.index)).toEqual([1, 2])
    expect(index.steps[0].action).toBe('first')
  })

  it('step 1 owns events before the first step', () => {
    const json = fixtureJson() as Json
    const bad = [undefined, 0, -1, 1.5, '1', null]
    json.network = bad.map((s) => ({ step_index: s, method: 'GET', url: 'u' }))
    json.console = bad.map((s) => ({ step_index: s, level: 'log', text: 't' }))
    const index = parseOk(json)
    expect(index.network.map((n) => n.stepIndex)).toEqual(bad.map(() => 1))
    expect(index.console.map((n) => n.stepIndex)).toEqual(bad.map(() => 1))
  })

  it('makes entries naming no real step orphans, and everything an orphan with zero steps', () => {
    const json = fixtureJson() as Json
    json.network = [{ step_index: 999, url: 'u' }, { step_index: 2, url: 'u' }]
    json.console = [{ step_index: 999, text: 't' }]
    const index = parseOk(json)
    expect(index.network.map((n) => n.stepIndex)).toEqual([null, 2])
    expect(index.console[0].stepIndex).toBeNull()

    json.steps = []
    json.network = [{ url: 'u' }, { step_index: 1, url: 'u' }]
    const empty = parseOk(json)
    expect(empty.network.map((n) => n.stepIndex)).toEqual([null, null])
  })

  it('makes an entry pointing at a step dropped by the cap an orphan', () => {
    const json = fixtureJson() as Json
    json.steps = Array.from({ length: 5003 }, (_, i) => step(i + 1))
    json.network = [{ step_index: 5001, url: 'u' }, { step_index: 5000, url: 'u' }]
    json.console = [{ step_index: 5003, text: 't' }]
    const index = parseOk(json)
    expect(index.network.map((n) => n.stepIndex)).toEqual([null, 5000])
    expect(index.console[0].stepIndex).toBeNull()
  })

  it('treats step indices below 1 as invalid', () => {
    const index = parseOk(withSteps([step(0), step(-2), step(1), step(2, { kind: 'group' }), step(3, { parent_index: 0 })]))
    expect(index.steps.map((s) => s.index)).toEqual([1, 2, 3])
    expect(index.steps[2].parentIndex).toBeNull()
  })

  it('caps the lists, keeps the first entries and records dropped counts', () => {
    const json = fixtureJson() as Json
    json.truncated = { steps: 2, network: 1, console: 0 }
    json.steps = Array.from({ length: 5003 }, (_, i) => step(i + 1))
    json.network = Array.from({ length: 10004 }, () => ({ step_index: 1, url: 'u' }))
    json.console = Array.from({ length: 10001 }, () => ({ step_index: 1, text: 't' }))
    const index = parseOk(json)
    expect(index.steps).toHaveLength(5000)
    expect(index.steps[4999].index).toBe(5000)
    expect(index.network).toHaveLength(10000)
    expect(index.console).toHaveLength(10000)
    expect(index.truncated.steps).toBe(5)
    expect(index.truncated.network).toBe(5)
    expect(index.truncated.console).toBe(1)
  })

  it('fails closed on a non-boolean secret', () => {
    for (const secret of ['true', 1, {}, 'false', 0, null, []]) {
      const s = parseOk(withSteps([step(1, { secret, value: 'hunter2' })])).steps[0]
      expect(s.secret, JSON.stringify(secret)).toBe(true)
      expect(s.value).toBeNull()
    }
    const open = parseOk(withSteps([step(1, { value: 'v' }), step(2, { secret: false, value: 'v' })]))
    expect(open.steps.map((s) => [s.secret, s.value])).toEqual([[false, 'v'], [false, 'v']])
  })

  it('keeps element.label and error.message on a secret step', () => {
    const s = parseOk(
      withSteps([step(1, { secret: true, element: { label: 'Password' }, error: { class: 'E', message: 'm' } })])
    ).steps[0]
    expect(s.element?.label).toBe('Password')
    expect(s.error?.message).toBe('m')
  })

  it('drops malformed error objects and keeps well-formed ones', () => {
    const index = parseOk(
      withSteps([
        step(1, { error: { class: 'A' } }),
        step(2, { error: { class: 'A', message: 'm' } }),
        step(3, { error: 'boom' })
      ])
    )
    expect(index.steps.map((s) => s.error)).toEqual([null, { className: 'A', message: 'm' }, null])
  })

  it('caps oversized strings', () => {
    const big = 'a'.repeat(1_000_000)
    const index = parseOk(withSteps([step(1, { url: big, value: big })]))
    expect(index.steps[0].url!.length).toBeLessThan(100_000)
    expect(index.steps[0].value!.length).toBeLessThan(100_000)
  })

  it('never throws on random JSON shapes', () => {
    let seed = 12345
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296
      return seed / 4294967296
    }
    const keys = [
      'format', 'version', 'steps', 'network', 'console', 'test', 'browser', 'capabilities',
      'truncated', 'index', 'parent_index', 'kind', 'action', 'locator', 'element', 'value',
      'secret', 'error', 'class', 'message', 'source', 'rect', 'screenshot', 'snapshot', 'within',
      'step_index', 'started_at', 'duration_ms', 'name', '__proto__', 'constructor'
    ]
    const scalar = (): unknown => {
      const pick = Math.floor(rnd() * 10)
      return [null, true, false, 0, 1, -1, 1.5, 'steps/0001.jpg', 'raider-trace', 'x', NaN, Infinity][pick] ?? 2
    }
    const gen = (depth: number): unknown => {
      const r = rnd()
      if (depth <= 0 || r < 0.3) return scalar()
      if (r < 0.55) return Array.from({ length: Math.floor(rnd() * 4) }, () => gen(depth - 1))
      const o: Record<string, unknown> = {}
      for (let i = Math.floor(rnd() * 6); i > 0; i--) {
        Object.defineProperty(o, keys[Math.floor(rnd() * keys.length)], {
          value: gen(depth - 1), enumerable: true, configurable: true, writable: true
        })
      }
      return o
    }
    const names = fixtureEntryNames()
    for (let i = 0; i < 3000; i++) {
      const doc: Json = i % 2 ? { format: 'raider-trace', version: 1, ...(gen(4) as object) } : (gen(5) as Json)
      if (i % 2) doc.format = 'raider-trace'
      if (i % 2) doc.version = 1
      const r = parseTraceIndex(doc, names)
      if (r.ok) {
        const seen = new Set<number>()
        for (const s of r.index.steps) {
          expect(seen.has(s.index)).toBe(false)
          if (s.parentIndex !== null) {
            expect(seen.has(s.parentIndex)).toBe(true)
          }
          if (s.secret) expect(s.value).toBeNull()
          seen.add(s.index)
        }
      }
    }
  })
})

describe('parseTraceIndex network mocked field', () => {
  it('keeps fulfilled and failed, and drops absent, unknown or non-string values to null', () => {
    const json = fixtureJson() as Json
    const values: unknown[] = ['fulfilled', 'failed', undefined, 'continued', 'Fulfilled']
    values.push(1, {}, null, true)
    json.network = values.map((mocked) => ({ step_index: 1, method: 'GET', url: 'u', mocked }))
    const index = parseOk(json)
    const expected = ['fulfilled', 'failed', null, null, null, null, null, null, null]
    expect(index.network.map((n) => n.mocked)).toEqual(expected)
  })

  it('gives fixture entries without the field no mock', () => {
    expect(fixtureIndex().network.every((n) => n.mocked === null)).toBe(true)
  })
})
