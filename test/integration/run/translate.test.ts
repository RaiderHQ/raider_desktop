// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { Translator } from '../../../src/main/handlers/run/translate'

const test1 = {
  id: 'a',
  file: 'spec/a_spec.rb',
  line: 3,
  description: 'works',
  full_name: 'A works'
}

describe('Translator', () => {
  it('turns a plan line into run:planned', () => {
    const t = new Translator('r1', false)
    const events = t.translate(0, { v: 1, type: 'plan', tests: [test1] })
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'run:planned', runId: 'r1' })
    const ev = events[0] as { tests: Array<{ fullName: string }> }
    expect(ev.tests[0].fullName).toBe('A works')
    expect(events[0]).not.toHaveProperty('worker')
  })

  it('turns started into a started run:example', () => {
    const t = new Translator('r1', false)
    const [ev] = t.translate(0, { v: 1, type: 'started', ...test1 })
    expect(ev).toEqual({
      type: 'run:example',
      runId: 'r1',
      id: 'a',
      file: 'spec/a_spec.rb',
      line: 3,
      description: 'works',
      fullName: 'A works',
      status: 'started'
    })
  })

  it('fills a finished line from the started line', () => {
    const t = new Translator('r1', false)
    t.translate(0, { v: 1, type: 'started', ...test1 })
    const [ev] = t.translate(0, {
      v: 1,
      type: 'finished',
      id: 'a',
      status: 'failed',
      duration_ms: 12,
      attempts: 2
    })
    expect(ev).toMatchObject({
      type: 'run:example',
      id: 'a',
      file: 'spec/a_spec.rb',
      line: 3,
      description: 'works',
      fullName: 'A works',
      status: 'failed',
      durationMs: 12,
      attempt: 2
    })
  })

  it('fills a finished line from the plan', () => {
    const t = new Translator('r1', false)
    t.translate(0, { v: 1, type: 'plan', tests: [test1] })
    const [ev] = t.translate(0, { v: 1, type: 'finished', id: 'a', status: 'passed' })
    expect(ev).toMatchObject({ file: 'spec/a_spec.rb', fullName: 'A works' })
  })

  it('still emits a finished line for an unknown id', () => {
    const t = new Translator('r1', false)
    const [ev] = t.translate(0, { v: 1, type: 'finished', id: 'zz', status: 'passed' })
    expect(ev).toMatchObject({
      type: 'run:example',
      id: 'zz',
      file: '',
      line: null,
      description: 'zz',
      fullName: 'zz',
      status: 'passed'
    })
  })

  it('sets worker only when parallel', () => {
    const serial = new Translator('r1', false)
    const [a] = serial.translate(2, { v: 1, type: 'started', ...test1 })
    expect(a).not.toHaveProperty('worker')
    const parallel = new Translator('r1', true)
    const [b] = parallel.translate(2, { v: 1, type: 'started', ...test1 })
    expect(b).toMatchObject({ worker: 2 })
    const [p] = parallel.translate(2, { v: 1, type: 'plan', tests: [test1] })
    expect(p).toMatchObject({ worker: 2 })
  })

  it('gives [] for done, unknown types and v !== 1', () => {
    const t = new Translator('r1', false)
    expect(t.translate(0, { v: 1, type: 'done' })).toEqual([])
    expect(t.translate(0, { v: 1, type: 'weird' })).toEqual([])
    expect(t.translate(0, { v: 2, type: 'plan', tests: [test1] })).toEqual([])
    expect(t.badLines).toBe(1)
  })

  describe('untrusted shapes', () => {
    it('skips a bad plan entry, keeps the rest, counts it', () => {
      const seen: number[] = []
      const t = new Translator('r1', false, () => seen.push(1))
      const [ev] = t.translate(0, { v: 1, type: 'plan', tests: [null, 5, test1] })
      expect((ev as { tests: unknown[] }).tests).toHaveLength(1)
      expect(seen).toHaveLength(2)
    })

    it('rejects a plan without a tests array', () => {
      const t = new Translator('r1', false)
      expect(t.translate(0, { v: 1, type: 'plan' })).toEqual([])
      expect(t.badLines).toBe(1)
    })

    it('rejects started/finished without an id', () => {
      const t = new Translator('r1', false)
      expect(t.translate(0, { v: 1, type: 'started' })).toEqual([])
      expect(t.translate(0, { v: 1, type: 'finished', status: 'passed' })).toEqual([])
      expect(t.badLines).toBe(2)
    })

    it('rejects an unknown or missing finished status', () => {
      const t = new Translator('r1', false)
      expect(t.translate(0, { v: 1, type: 'finished', id: 'a', status: 'weird' })).toEqual([])
      expect(t.translate(0, { v: 1, type: 'finished', id: 'a' })).toEqual([])
      expect(t.badLines).toBe(2)
    })

    it('rejects non-object lines and calls onBadLine', () => {
      let calls = 0
      const t = new Translator('r1', false, () => calls++)
      for (const line of [5, null, [], 'x']) expect(t.translate(0, line)).toEqual([])
      expect(calls).toBe(4)
    })
  })
})
