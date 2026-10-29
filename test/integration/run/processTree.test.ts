// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { descendantPids, descendantsOf, parsePs } from '../../../src/main/handlers/run/processTree'

const PS = [
  '    1     0     1',
  '  100     1   100',
  '  101   100   100',
  '  102   101   102', // own group, like chromedriver
  '  103   102   102',
  '  200     1   200', // unrelated
  'garbage line',
  ''
].join('\n')

type PsResult = { stdout: string | null; status: number | null }
const ps =
  (stdout: string | null, status = 0) =>
  (): PsResult => ({ stdout, status })

describe('processTree', () => {
  it('parses pid, ppid and pgid, skipping malformed lines', () => {
    expect(parsePs(PS)).toHaveLength(6)
    expect(parsePs(PS)[3]).toEqual({ pid: 102, ppid: 101, pgid: 102 })
  })

  it('walks every descendant breadth-first, not the root', () => {
    expect(descendantsOf(100, parsePs(PS)).map((p) => p.pid)).toEqual([101, 102, 103])
    expect(descendantsOf(200, parsePs(PS))).toEqual([])
  })

  it('survives a parent cycle', () => {
    const cyclic = parsePs('5 6 5\n6 5 5\n')
    expect(descendantsOf(5, cyclic).map((p) => p.pid)).toEqual([6])
  })

  it('reads ps through the given spawnSync', () => {
    let args: unknown[] = []
    const stub = (...a: unknown[]): { stdout: string; status: number } => {
      args = a
      return { stdout: PS, status: 0 }
    }
    expect(descendantPids(101, stub)).toEqual([102, 103])
    expect(args.slice(0, 2)).toEqual(['ps', ['-A', '-o', 'pid=,ppid=,pgid=']])
  })

  it('returns [] when ps fails', () => {
    expect(descendantPids(100, ps(null, 1))).toEqual([])
    expect(
      descendantPids(100, () => ({ stdout: '', status: null, error: new Error('ENOENT') }))
    ).toEqual([])
    expect(
      descendantPids(100, () => {
        throw new Error('boom')
      })
    ).toEqual([])
  })
})
