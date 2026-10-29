// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  descendantPids,
  descendantsOf,
  freshKillTargets,
  killTargets,
  parsePs
} from '../../../src/main/handlers/run/processTree'

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

  describe('killTargets (SIGKILL some time after recording)', () => {
    it('kills fresh descendants and recorded pids still parented inside the run', () => {
      // 102 (chromedriver) was reparented to 1 after 101 died; 103 (browser) still under 102
      const later = parsePs('100 1 100\n102 1 102\n103 102 102\n104 100 100\n')
      expect(killTargets(100, [101, 102, 103], later).sort()).toEqual([103, 104])
    })

    it('leaves a recorded pid alone once it was reused by an unrelated process', () => {
      const later = parsePs('100 1 100\n101 200 200\n200 1 200\n')
      expect(killTargets(100, [101], later)).toEqual([])
    })

    it('reads a fresh ps and returns [] when ps fails', () => {
      const stub = (): { stdout: string; status: number } => ({ stdout: PS, status: 0 })
      expect(freshKillTargets(100, [], stub)).toEqual([101, 102, 103])
      expect(freshKillTargets(100, [101], ps(null, 1))).toEqual([])
    })
  })
})
