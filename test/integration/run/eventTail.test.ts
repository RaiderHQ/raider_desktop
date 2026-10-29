// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { EventTail } from '../../../src/main/handlers/run/eventTail'

describe('EventTail', () => {
  let dir: string
  let lines: Array<[number, unknown]>
  let bad: number
  let tail: EventTail

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'event-tail-'))
    lines = []
    bad = 0
    tail = new EventTail(
      dir,
      (worker, line) => lines.push([worker, line]),
      () => {
        bad += 1
      }
    )
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('reads lines appended across polls', async () => {
    const file = path.join(dir, 'worker-0.ndjson')
    fs.writeFileSync(file, '{"a":1}\n')
    await tail.poll()
    fs.appendFileSync(file, '{"a":2}\n{"a":3}\n')
    await tail.poll()
    expect(lines).toEqual([
      [0, { a: 1 }],
      [0, { a: 2 }],
      [0, { a: 3 }]
    ])
  })

  it('holds a partial last line until its newline arrives', async () => {
    const file = path.join(dir, 'worker-0.ndjson')
    fs.writeFileSync(file, '{"v":1,"ty')
    await tail.poll()
    expect(lines).toHaveLength(0)
    fs.appendFileSync(file, 'pe":"done"}\n')
    await tail.poll()
    expect(lines).toEqual([[0, { v: 1, type: 'done' }]])
  })

  it('does not corrupt a multi-byte character split across reads', async () => {
    const file = path.join(dir, 'worker-0.ndjson')
    const bytes = Buffer.from('{"d":"é"}\n', 'utf8')
    const cut = bytes.indexOf(0xc3) + 1
    fs.writeFileSync(file, bytes.subarray(0, cut))
    await tail.poll()
    fs.appendFileSync(file, bytes.subarray(cut))
    await tail.poll()
    expect(lines).toEqual([[0, { d: 'é' }]])
  })

  it('picks up a worker file that appears after the first poll', async () => {
    await tail.poll()
    fs.writeFileSync(path.join(dir, 'worker-2.ndjson'), '{"a":1}\n')
    await tail.poll()
    expect(lines).toEqual([[2, { a: 1 }]])
  })

  it('reports bad JSON once per line and keeps going', async () => {
    const file = path.join(dir, 'worker-0.ndjson')
    fs.writeFileSync(file, 'not json\n{"a":1}\n')
    await tail.poll()
    await tail.poll()
    expect(bad).toBe(1)
    expect(lines).toEqual([[0, { a: 1 }]])
  })

  it('tolerates a missing directory', async () => {
    fs.rmSync(dir, { recursive: true, force: true })
    await expect(tail.poll()).resolves.toBeUndefined()
  })

  it('does not run polls concurrently', async () => {
    fs.writeFileSync(path.join(dir, 'worker-0.ndjson'), '{"a":1}\n')
    await Promise.all([tail.poll(), tail.poll(), tail.poll()])
    expect(lines).toHaveLength(1)
  })

  it('a poll requested mid-poll gets a follow-up pass that sees newer bytes', async () => {
    const file = path.join(dir, 'worker-0.ndjson')
    fs.writeFileSync(file, '{"a":1}\n')
    const seen: unknown[] = []
    let second: Promise<void> | undefined
    const t = new EventTail(
      dir,
      (_w, line) => {
        seen.push(line)
        if (seen.length === 1) {
          // Pass 1 has already read line 1 and is delivering it: write line 2 now and ask again.
          fs.appendFileSync(file, '{"a":2}\n')
          second = t.poll()
        }
      },
      () => {}
    )
    await t.poll()
    await second
    expect(seen).toEqual([{ a: 1 }, { a: 2 }])
  })

  it('a throwing onLine does not lose the rest of the chunk', async () => {
    const got: unknown[] = []
    const t = new EventTail(
      dir,
      (_w, line) => {
        got.push(line)
        if (got.length === 1) throw new Error('boom')
      },
      () => {}
    )
    fs.writeFileSync(path.join(dir, 'worker-0.ndjson'), '{"a":1}\n{"a":2}\n')
    await t.poll()
    await t.poll()
    expect(got).toEqual([{ a: 1 }, { a: 2 }])
  })
})
