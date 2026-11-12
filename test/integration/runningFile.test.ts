// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  acquireRunning,
  pidAlive,
  readRunning,
  releaseRunning,
  type RunningDeps
} from '../../src/main/handlers/schedules/runningFile'

const OTHER = 424242
let project: string
let dir: string
let file: string
let alive: Set<number>
let deps: RunningDeps

const writeRunning = (data: unknown): void =>
  fs.writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data))
const onDisk = (): Record<string, unknown> => JSON.parse(fs.readFileSync(file, 'utf8'))
const withSchedules = (): void => {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'schedules.yml'), 'schedules: []\n')
}

beforeEach(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'running-file-'))
  dir = path.join(project, '.raider', 'schedules')
  file = path.join(dir, 'running.json')
  alive = new Set([OTHER])
  deps = { pid: 1000, isAlive: (pid): boolean => alive.has(pid) }
})

afterEach(() => {
  fs.rmSync(project, { recursive: true, force: true })
})

describe('pidAlive', () => {
  it('is true when kill(0) succeeds or throws EPERM, false otherwise; sends signal 0 only', () => {
    const kill = vi.spyOn(process, 'kill')
    try {
      kill.mockImplementationOnce(() => true)
      expect(pidAlive(5)).toBe(true)
      kill.mockImplementationOnce(() => {
        throw Object.assign(new Error('no'), { code: 'EPERM' })
      })
      expect(pidAlive(5)).toBe(true)
      kill.mockImplementationOnce(() => {
        throw Object.assign(new Error('gone'), { code: 'ESRCH' })
      })
      expect(pidAlive(5)).toBe(false)
      expect(kill.mock.calls.every((c) => c[1] === 0)).toBe(true)
    } finally {
      kill.mockRestore()
    }
  })
})

describe('readRunning', () => {
  beforeEach(() => fs.mkdirSync(dir, { recursive: true }))

  it('reads a small regular JSON object', () => {
    writeRunning({ pid: OTHER, name: 'nightly', run_id: 'ab', started_at: 'x' })
    expect(readRunning(file)).toMatchObject({ pid: OTHER, name: 'nightly' })
  })

  it('is null for a missing file, bad JSON, a non-object and a file over 4 KB', () => {
    expect(readRunning(file)).toBeNull()
    writeRunning('{nope')
    expect(readRunning(file)).toBeNull()
    writeRunning('[1,2]')
    expect(readRunning(file)).toBeNull()
    writeRunning(JSON.stringify({ pid: OTHER, pad: 'x'.repeat(4100) }))
    expect(readRunning(file)).toBeNull()
  })

  it('does not follow a symlink', () => {
    const target = path.join(project, 'elsewhere.json')
    fs.writeFileSync(target, JSON.stringify({ pid: OTHER, name: 'nightly' }))
    fs.symlinkSync(target, file)
    expect(readRunning(file)).toBeNull()
  })

  it('is null for a directory', () => {
    fs.mkdirSync(file)
    expect(readRunning(file)).toBeNull()
  })

  it.skipIf(process.platform === 'win32')('is null for a fifo, without blocking', () => {
    execFileSync('mkfifo', [file])
    const started = Date.now()
    expect(readRunning(file)).toBeNull()
    expect(Date.now() - started).toBeLessThan(1000)
  })
})

describe('acquireRunning: busy check', () => {
  beforeEach(() => fs.mkdirSync(dir, { recursive: true }))

  it('refuses when another live pid holds running.json, with its name', () => {
    writeRunning({ pid: OTHER, name: 'nightly', run_id: 'ab', started_at: 'x' })
    expect(acquireRunning(project, deps)).toEqual({ ok: false, name: 'nightly' })
  })

  it('omits a name that is not a schedule name', () => {
    writeRunning({ pid: OTHER, name: 'Bad Name!', run_id: 'ab' })
    expect(acquireRunning(project, deps)).toEqual({ ok: false })
  })

  it.each([
    ['a dead pid', { pid: 777 }],
    ['the app own pid', { pid: 1000 }],
    ['pid 0', { pid: 0 }],
    ['a negative pid', { pid: -1 }],
    ['a string pid', { pid: String(OTHER) }],
    ['a fractional pid', { pid: 1.5 }]
  ])('is not busy for %s', (_label, data) => {
    const isAlive = vi.fn(deps.isAlive)
    writeRunning({ ...data, name: 'nightly', run_id: 'ab' })
    expect(acquireRunning(project, { ...deps, isAlive })).toEqual({ ok: true, lock: null })
    // pid ≤ 0 and non-integers are never checked (kill(0, …) would hit the process group)
    for (const [pid] of isAlive.mock.calls) expect(Number.isSafeInteger(pid) && pid > 0).toBe(true)
  })

  it('without schedules.yml never writes running.json', () => {
    expect(acquireRunning(project, deps)).toEqual({ ok: true, lock: null })
    expect(fs.existsSync(file)).toBe(false)
  })

  it('never creates .raider/schedules', () => {
    fs.rmSync(path.join(project, '.raider'), { recursive: true })
    expect(acquireRunning(project, deps)).toEqual({ ok: true, lock: null })
    expect(fs.existsSync(path.join(project, '.raider'))).toBe(false)
  })

  it('ignores a .raider/schedules that is a link', () => {
    fs.rmSync(path.join(project, '.raider'), { recursive: true })
    const real = path.join(project, 'real')
    fs.mkdirSync(real)
    fs.writeFileSync(path.join(real, 'schedules.yml'), '')
    fs.writeFileSync(path.join(real, 'running.json'), JSON.stringify({ pid: OTHER, name: 'n' }))
    fs.mkdirSync(path.join(project, '.raider'))
    fs.symlinkSync(real, dir)
    expect(acquireRunning(project, deps)).toEqual({ ok: true, lock: null })
    expect(JSON.parse(fs.readFileSync(path.join(real, 'running.json'), 'utf8')).pid).toBe(OTHER)
  })

  it('does not write when schedules.yml is a link', () => {
    const target = path.join(project, 'schedules.yml')
    fs.writeFileSync(target, '')
    fs.symlinkSync(target, path.join(dir, 'schedules.yml'))
    expect(acquireRunning(project, deps)).toEqual({ ok: true, lock: null })
    expect(fs.existsSync(file)).toBe(false)
  })
})

describe('acquireRunning: write and release', () => {
  beforeEach(withSchedules)

  it('writes {pid, name: desktop, run_id, started_at} exclusively, mode 0600', () => {
    const result = acquireRunning(project, deps)
    if (!result.ok || !result.lock) throw new Error('not acquired')
    const data = onDisk()
    expect(data).toEqual({
      pid: 1000,
      name: 'desktop',
      run_id: result.lock.runId,
      started_at: expect.any(String)
    })
    expect(result.lock.runId).toMatch(/^[0-9a-f]{16}$/)
    expect(Number.isNaN(Date.parse(data.started_at as string))).toBe(false)
    if (process.platform !== 'win32') expect(fs.statSync(file).mode & 0o777).toBe(0o600)
  })

  it.each([
    ['a dead pid', { pid: 777, run_id: 'old' }],
    ['the app own pid', { pid: 1000, run_id: 'old' }],
    ['bad JSON', '{oops']
  ])('replaces a stale running.json (%s)', (_label, data) => {
    writeRunning(data)
    const result = acquireRunning(project, deps)
    expect(result).toMatchObject({ ok: true, lock: { runId: expect.any(String) } })
    expect(onDisk().pid).toBe(1000)
  })

  it('replaces a running.json symlink without touching its target', () => {
    const target = path.join(project, 'target.json')
    fs.writeFileSync(target, 'keep')
    fs.symlinkSync(target, file)
    expect(acquireRunning(project, deps)).toMatchObject({ ok: true })
    expect(fs.lstatSync(file).isFile()).toBe(true)
    expect(fs.readFileSync(target, 'utf8')).toBe('keep')
  })

  it('treats a running.json it cannot replace as busy', () => {
    fs.mkdirSync(file)
    expect(acquireRunning(project, deps)).toEqual({ ok: false })
  })

  it('release removes running.json only while it holds this run_id', () => {
    const first = acquireRunning(project, deps)
    if (!first.ok || !first.lock) throw new Error('not acquired')
    // Replaced by someone else: kept
    writeRunning({ pid: OTHER, name: 'nightly', run_id: 'theirs' })
    releaseRunning(first.lock)
    expect(onDisk().run_id).toBe('theirs')
    fs.unlinkSync(file)
    const second = acquireRunning(project, deps)
    if (!second.ok || !second.lock) throw new Error('not acquired')
    releaseRunning(second.lock)
    expect(fs.existsSync(file)).toBe(false)
    // Twice is harmless
    expect(() => releaseRunning(second.lock!)).not.toThrow()
  })
})
