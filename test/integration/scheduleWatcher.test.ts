import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, mkdir, writeFile, appendFile, rm, symlink, realpath } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', () => ({ Notification: class {} }))

import {
  createScheduleWatcher,
  isScheduleChange,
  readScheduleNotify,
  startScheduleWatcher,
  stopScheduleWatcher,
  SCHEDULE_FAILED_TITLE,
  type ScheduleWatcher,
  type ScheduleWatcherDeps
} from '../../src/main/handlers/schedules/scheduleWatcher'

interface FakeWatch {
  dir: string
  recursive: boolean
  fire: (filename?: string | null) => void
  error: () => void
  closed: boolean
}

/** A fake fs.watch, Notification, window and timer; the file system is a real temp folder */
function fakes(): {
  deps: ScheduleWatcherDeps
  watches: FakeWatch[]
  notes: { title: string; body: string; click: () => void; closed: boolean }[]
  sent: string[]
  payloads: unknown[][]
  win: {
    restore: ReturnType<typeof vi.fn>
    show: ReturnType<typeof vi.fn>
    focus: ReturnType<typeof vi.fn>
    minimized: boolean
  }
  flush: () => void
  timers: number
} {
  const watches: FakeWatch[] = []
  const notes: { title: string; body: string; click: () => void; closed: boolean }[] = []
  const sent: string[] = []
  const payloads: unknown[][] = []
  let pending: (() => void) | null = null
  const state = { timers: 0 }
  const win = { restore: vi.fn(), show: vi.fn(), focus: vi.fn(), minimized: true }
  const deps: ScheduleWatcherDeps = {
    watch: (dir, { recursive }, listener) => {
      let onError: () => void = () => undefined
      const w: FakeWatch = {
        dir,
        recursive,
        fire: (filename = null): void => listener(filename),
        error: () => onError(),
        closed: false
      }
      watches.push(w)
      return {
        close: (): void => {
          w.closed = true
        },
        on: (_event, l): void => {
          onError = (): void => l(new Error('gone'))
        }
      }
    },
    notifications: {
      isSupported: () => true,
      create: ({ title, body }) => {
        const handlers: Record<string, () => void> = {}
        const note = { title, body, click: (): void => handlers.click?.(), closed: false }
        notes.push(note)
        return {
          on: (event, l): void => {
            handlers[event] = l
          },
          show: (): void => undefined,
          close: (): void => {
            note.closed = true
          }
        }
      }
    },
    mainWindow: () => ({
      isDestroyed: () => false,
      isMinimized: () => win.minimized,
      restore: win.restore,
      show: win.show,
      focus: win.focus,
      webContents: {
        isDestroyed: () => false,
        send: (channel: string, ...args: unknown[]): void => {
          sent.push(channel)
          payloads.push(args)
        }
      }
    }),
    setTimer: (callback) => {
      state.timers++
      pending = callback
      return callback
    },
    clearTimer: (timer) => {
      if (pending === timer) pending = null
    }
  }
  return {
    deps,
    watches,
    notes,
    sent,
    payloads,
    win,
    flush: (): void => {
      const run = pending
      pending = null
      run?.()
    },
    get timers(): number {
      return state.timers
    }
  }
}

/** A run line as ruby_raider 4.2.0's `raider schedule run` appends it */
const line = (patch: Record<string, unknown> = {}): string =>
  JSON.stringify({
    run_id: 'c379fa6246da4274',
    started_at: '2026-11-10T11:12:35.478Z',
    finished_at: '2026-11-10T11:12:37.714Z',
    status: 'failed',
    counts: { total: 12, passed: 9, failed: 3, skipped: 0 },
    trigger: 'schedule',
    results_dir: 'raider-results',
    report_copy: '.raider/schedules/nightly/last',
    ...patch
  }) + '\n'

let dir: string
let watcher: ScheduleWatcher | null
const schedulesDir = (): string => join(dir, '.raider', 'schedules')
const log = (name = 'nightly'): string => join(schedulesDir(), name, 'runs.jsonl')

/** schedules.yml as the gem writes it (YAML.dump of Schedule#to_h), one entry per [name, notify] */
const entry = (name: string, notify: unknown): string =>
  `- name: ${name}\n  every: day\n  at: '09:30'\n  'on':\n  retries: 0\n  notify: ${notify}\n` +
  `  show_browser: false\n  selection:\n    kind: all\n  os_id: dev.rubyraider.schedule.x.${name}\n` +
  `  ruby: "/usr/bin/ruby"\n  bundle: "/usr/bin/bundle"\n  gem_env: {}\n  created_at: '2026-11-10T09:00:00Z'\n`
const writeSchedules = (...entries: [string, unknown][]): Promise<void> =>
  writeFile(
    join(schedulesDir(), 'schedules.yml'),
    `---\nschedules:\n${entries.map(([n, v]) => entry(n, v)).join('')}`
  )

beforeEach(async () => {
  dir = await realpath(await mkdtemp(join(tmpdir(), 'schedule-watcher-')))
  await mkdir(join(schedulesDir(), 'nightly'), { recursive: true })
  await writeSchedules(['nightly', false], ['loud', true])
  watcher = null
})

afterEach(async () => {
  watcher?.stop()
  stopScheduleWatcher()
  await rm(dir, { recursive: true, force: true })
})

/** The watches still open */
const open = (f: ReturnType<typeof fakes>): FakeWatch[] => f.watches.filter((w) => !w.closed)

/** Fires a change and waits for the settled scan */
async function change(f: ReturnType<typeof fakes>): Promise<void> {
  f.watches.filter((w) => !w.closed).forEach((w) => w.fire())
  f.flush()
  await watcher!.idle()
}

async function started(f: ReturnType<typeof fakes>): Promise<ScheduleWatcher> {
  watcher = createScheduleWatcher(dir, f.deps)
  await watcher.idle()
  return watcher
}

describe('scheduleWatcher', () => {
  it('watches .raider/schedules recursively', async () => {
    const f = fakes()
    await started(f)
    expect(f.watches).toHaveLength(1)
    expect(f.watches[0]).toMatchObject({ dir: schedulesDir(), recursive: true })
  })

  it('seeds the lines there at start; only a new failed scheduled line shows a banner, once', async () => {
    await writeFile(
      log(),
      line({ run_id: 'aaaaaaaaaaaaaaaa' }) + line({ run_id: 'bbbbbbbbbbbbbbbb' })
    )
    const f = fakes()
    await started(f)
    await change(f)
    expect(f.notes).toHaveLength(0)
    expect(f.sent).toEqual(['schedules-changed'])

    await appendFile(log(), line())
    await change(f)
    expect(f.notes).toEqual([
      expect.objectContaining({
        title: SCHEDULE_FAILED_TITLE,
        body: 'nightly: 3 of 12 tests failed'
      })
    ])
    expect(SCHEDULE_FAILED_TITLE).toBe('Scheduled run failed')
    await change(f)
    expect(f.notes).toHaveLength(1)
  })

  it('a new scheduled line pushes schedules-changed and scheduled-run-finished with the project', async () => {
    const f = fakes()
    await started(f)
    await appendFile(
      log(),
      line({ status: 'passed', counts: { total: 2, passed: 2, failed: 0, skipped: 0 } })
    )
    await change(f)
    expect(f.sent).toEqual(['schedules-changed', 'scheduled-run-finished'])
    expect(f.payloads).toEqual([[], [dir]])
    expect(f.notes).toHaveLength(0)
  })

  it('reloads the Dashboard once per scan, only for passed, failed and setup_error scheduled lines', async () => {
    const f = fakes()
    await started(f)
    await appendFile(
      log(),
      line({ run_id: '1000000000000000', status: 'busy' }) +
        line({ run_id: '2000000000000000', trigger: 'manual' }) +
        line({ run_id: '3000000000000000', status: 'weird' })
    )
    await change(f)
    expect(f.sent).toEqual(['schedules-changed'])
    await appendFile(
      log(),
      line({ run_id: '4000000000000000', status: 'passed' }) +
        line({ run_id: '5000000000000000', status: 'setup_error' })
    )
    await change(f)
    expect(f.sent).toEqual(['schedules-changed', 'schedules-changed', 'scheduled-run-finished'])
  })

  it('no banner when the schedule notifies itself (notify: true)', async () => {
    await mkdir(join(schedulesDir(), 'loud'))
    const f = fakes()
    await started(f)
    await writeFile(log('loud'), line())
    await change(f)
    expect(f.notes).toHaveLength(0)
    expect(f.sent).toContain('scheduled-run-finished')
  })

  it('no banner for a schedule not in schedules.yml, or without a readable schedules.yml', async () => {
    await mkdir(join(schedulesDir(), 'gone'))
    const f = fakes()
    await started(f)
    await writeFile(log('gone'), line())
    await change(f)
    expect(f.notes).toHaveLength(0)
    await writeFile(join(schedulesDir(), 'schedules.yml'), 'schedules: [: bad')
    await appendFile(log(), line({ run_id: '1000000000000000' }))
    await change(f)
    expect(f.notes).toHaveLength(0)
    await rm(join(schedulesDir(), 'schedules.yml'))
    await appendFile(log(), line({ run_id: '2000000000000000' }))
    await change(f)
    expect(f.notes).toHaveLength(0)
  })

  it('passed and busy lines show no banner; setup_error (also a stopped run) says it could not start', async () => {
    const f = fakes()
    await started(f)
    await appendFile(
      log(),
      line({ run_id: '1000000000000000', status: 'passed' }) +
        line({ run_id: '2000000000000000', status: 'busy' }) +
        line({ run_id: '3000000000000000', trigger: 'manual' }) +
        line({
          run_id: '4000000000000000',
          status: 'setup_error',
          counts: { total: 0, passed: 0, failed: 0, skipped: 0 }
        })
    )
    await change(f)
    expect(f.notes.map((n) => n.body)).toEqual(['nightly could not start'])
  })

  it('counts: one test, and a failed line whose counts are bad', async () => {
    const f = fakes()
    await started(f)
    await appendFile(
      log(),
      line({ run_id: '1000000000000000', counts: { total: 1, passed: 0, failed: 1, skipped: 0 } }) +
        line({ run_id: '2000000000000000', counts: { total: '12', failed: 3 } }) +
        line({ run_id: '3000000000000000', counts: { total: 2, failed: -1 } }) +
        line({ run_id: '4000000000000000', counts: { total: 2, failed: 3 } }) +
        line({ run_id: '5000000000000000', counts: null })
    )
    await change(f)
    expect(f.notes.map((n) => n.body)).toEqual([
      'nightly: 1 of 1 test failed',
      'nightly failed',
      'nightly failed',
      'nightly failed',
      'nightly failed'
    ])
  })

  it('does not banner a line again after the gem trims (rewrites) the log', async () => {
    await writeFile(log(), line({ run_id: 'aaaaaaaaaaaaaaaa' }) + line())
    const f = fakes()
    await started(f)
    await writeFile(log(), line())
    await change(f)
    expect(f.notes).toHaveLength(0)
    expect(f.sent).toEqual(['schedules-changed'])
  })

  it('does not banner old lines after a read that caught the log empty or missing', async () => {
    await writeFile(log(), line())
    const f = fakes()
    await started(f)
    await writeFile(log(), '')
    await change(f)
    await rm(log())
    await change(f)
    await writeFile(log(), line())
    await change(f)
    expect(f.notes).toHaveLength(0)
  })

  it('keys a line by started_at when run_id is missing or not a run id', async () => {
    const f = fakes()
    await started(f)
    const two =
      line({ run_id: undefined, started_at: '2026-11-10T11:00:00.000Z' }) +
      line({ run_id: 'NOT-A-RUN-ID', started_at: '2026-11-10T12:00:00.000Z' })
    await appendFile(log(), two)
    await change(f)
    expect(f.notes).toHaveLength(2)
    await writeFile(log(), two)
    await change(f)
    expect(f.notes).toHaveLength(2)
  })

  it('debounces: 5 events make one scan and one schedules-changed', async () => {
    const f = fakes()
    await started(f)
    await appendFile(log(), line())
    for (let i = 0; i < 5; i++) f.watches[0].fire()
    expect(f.timers).toBe(5)
    f.flush()
    f.flush()
    await watcher!.idle()
    expect(f.sent).toEqual(['schedules-changed', 'scheduled-run-finished'])
    expect(f.notes).toHaveLength(1)
  })

  it('ignores malformed lines and folders; the body holds only the name and integers', async () => {
    await mkdir(join(schedulesDir(), 'Bad-Name'), { recursive: true })
    await mkdir(join(schedulesDir(), 'Env'), { recursive: true })
    await writeSchedules(['nightly', false], ['Bad-Name', false], ['Env', false])
    const f = fakes()
    await started(f)
    await writeFile(join(schedulesDir(), 'Bad-Name', 'runs.jsonl'), line())
    await writeFile(join(schedulesDir(), 'Env', 'runs.jsonl'), line())
    await appendFile(
      log(),
      '{not json\n' +
        'x'.repeat(300 * 1024) +
        '\n' +
        '[1,2]\n' +
        '"text"\n' +
        line({
          run_id: '1000000000000000',
          name: '../../evil',
          counts: { total: 1e21, failed: '<b>3</b>' },
          message: 'rm -rf /'
        }) +
        line({ run_id: '2000000000000000', started_at: undefined, trigger: 'schedule' }).replace(
          '"run_id":"2000000000000000",',
          ''
        )
    )
    await change(f)
    expect(f.notes.map((n) => n.body)).toEqual(['nightly failed'])
  })

  describe('readScheduleNotify (schedules.yml)', () => {
    it('reads notify per valid name; true when on, false when off', async () => {
      await writeSchedules(['nightly', false], ['loud', true], ['Bad-Name', false])
      expect(await readScheduleNotify(dir)).toEqual(
        new Map([
          ['loud', true],
          ['nightly', false]
        ])
      )
    })

    it('a missing or non-boolean notify is unknown (no banner)', async () => {
      await writeFile(
        join(schedulesDir(), 'schedules.yml'),
        'schedules:\n- name: nightly\n  notify: "no"\n- name: other\n  notify: 1\n' +
          '- name: bare\n  every: day\n- name: nil_one\n  notify:\n'
      )
      expect(await readScheduleNotify(dir)).toEqual(new Map())
    })

    it('a name listed twice that disagrees is treated as notifying itself', async () => {
      await writeSchedules(['nightly', false], ['nightly', true])
      expect((await readScheduleNotify(dir)).get('nightly')).toBe(true)
      await writeSchedules(['nightly', true], ['nightly', false])
      expect((await readScheduleNotify(dir)).get('nightly')).toBe(true)
    })

    it('refuses a linked, oversized or non-mapping schedules.yml', async () => {
      const outside = await mkdtemp(join(tmpdir(), 'schedule-outside-'))
      try {
        await writeFile(
          join(outside, 'schedules.yml'),
          'schedules:\n- name: nightly\n  notify: false\n'
        )
        await rm(join(schedulesDir(), 'schedules.yml'))
        await symlink(join(outside, 'schedules.yml'), join(schedulesDir(), 'schedules.yml'))
        expect(await readScheduleNotify(dir)).toEqual(new Map())
        await rm(join(schedulesDir(), 'schedules.yml'))
        await writeFile(
          join(schedulesDir(), 'schedules.yml'),
          'schedules:\n- name: nightly\n  notify: false\n#' + 'x'.repeat(300 * 1024) + '\n'
        )
        expect(await readScheduleNotify(dir)).toEqual(new Map())
        await writeFile(join(schedulesDir(), 'schedules.yml'), '- name: nightly\n  notify: false\n')
        expect(await readScheduleNotify(dir)).toEqual(new Map())
        await writeFile(join(schedulesDir(), 'schedules.yml'), '!!js/function "x"\n')
        expect(await readScheduleNotify(dir)).toEqual(new Map())
      } finally {
        await rm(outside, { recursive: true, force: true })
      }
    })

    it('a linked schedules.yml saying notify: false gives no banner', async () => {
      const outside = await mkdtemp(join(tmpdir(), 'schedule-outside-'))
      try {
        await writeFile(
          join(outside, 'schedules.yml'),
          'schedules:\n- name: nightly\n  notify: false\n'
        )
        await rm(join(schedulesDir(), 'schedules.yml'))
        await symlink(join(outside, 'schedules.yml'), join(schedulesDir(), 'schedules.yml'))
        const f = fakes()
        await started(f)
        await appendFile(log(), line())
        await change(f)
        expect(f.notes).toHaveLength(0)
      } finally {
        await rm(outside, { recursive: true, force: true })
      }
    })
  })

  describe('which changes count', () => {
    it('only run logs, schedules.yml and schedule folders; a missing filename counts', () => {
      expect(isScheduleChange('nightly/runs.jsonl')).toBe(true)
      expect(isScheduleChange('schedules.yml')).toBe(true)
      expect(isScheduleChange('nightly')).toBe(true)
      expect(isScheduleChange(null)).toBe(true)
      for (const churn of [
        'running.json',
        'run.lock',
        'nightly/runs.jsonl.lock',
        'nightly/last',
        'nightly/last/index.html',
        'nightly/last/data/run.json',
        'nightly/scheduler.log',
        'nightly/scheduler.log.1',
        '.schedules.yml.a1b2c3d4e5f6.tmp',
        'Bad-Name/runs.jsonl',
        'nightly/sub/runs.jsonl',
        'Env/runs.jsonl'
      ])
        expect(isScheduleChange(churn), churn).toBe(false)
    })

    it('running.json, lock, report copy and scheduler.log churn push nothing', async () => {
      const f = fakes()
      await started(f)
      for (const name of [
        'running.json',
        'run.lock',
        'nightly/runs.jsonl.lock',
        'nightly/last/index.html',
        'nightly/scheduler.log'
      ])
        f.watches[0].fire(name)
      expect(f.timers).toBe(0)
      f.flush()
      await watcher!.idle()
      expect(f.sent).toEqual([])
      f.watches[0].fire('nightly/runs.jsonl')
      f.flush()
      await watcher!.idle()
      expect(f.sent).toEqual(['schedules-changed'])
    })
  })

  it('a click shows and focuses the window and asks for the schedules', async () => {
    const f = fakes()
    await started(f)
    await appendFile(log(), line())
    await change(f)
    f.notes[0].click()
    expect(f.win.restore).toHaveBeenCalled()
    expect(f.win.show).toHaveBeenCalled()
    expect(f.win.focus).toHaveBeenCalled()
    expect(f.sent).toEqual(['schedules-changed', 'scheduled-run-finished', 'focus-schedules'])
  })

  it('after stop (a project switch) closes its banners and a late click opens nothing', async () => {
    const f = fakes()
    await started(f)
    await appendFile(log(), line())
    await change(f)
    expect(f.notes).toHaveLength(1)
    watcher!.stop()
    expect(f.notes[0].closed).toBe(true)
    f.notes[0].click()
    expect(f.win.focus).not.toHaveBeenCalled()
    expect(f.sent).not.toContain('focus-schedules')
  })

  it('without .raider/schedules watches .raider and arms when it is made', async () => {
    await rm(schedulesDir(), { recursive: true })
    const f = fakes()
    await started(f)
    expect(f.watches[0]).toMatchObject({ dir: join(dir, '.raider'), recursive: false })
    // Other .raider churn while waiting settles but pushes nothing
    f.watches[0].fire('flows')
    f.flush()
    await watcher!.idle()
    expect(f.sent).toEqual([])

    await mkdir(join(schedulesDir(), 'nightly'), { recursive: true })
    await writeSchedules(['nightly', false])
    await writeFile(log(), line())
    // macOS can report the new entry as a change of the watched folder itself
    open(f)[0].fire('.raider')
    f.flush()
    await watcher!.idle()
    expect(f.watches[0].closed).toBe(true)
    expect(open(f)).toEqual([expect.objectContaining({ dir: schedulesDir(), recursive: true })])
    // Its first run is news: the folder was not there at start
    expect(f.notes).toHaveLength(1)
    expect(f.sent).toEqual(['schedules-changed', 'scheduled-run-finished'])
  })

  it('without .raider watches the project root; its churn pushes nothing', async () => {
    await rm(join(dir, '.raider'), { recursive: true })
    const f = fakes()
    await started(f)
    expect(f.watches[0]).toMatchObject({ dir, recursive: false })
    f.watches[0].fire('README.md')
    f.flush()
    await watcher!.idle()
    expect(f.sent).toEqual([])
    expect(f.watches.filter((w) => !w.closed)).toHaveLength(1)
    await mkdir(join(dir, '.raider'))
    open(f)[0].fire('.raider')
    f.flush()
    await watcher!.idle()
    expect(open(f)).toEqual([
      expect.objectContaining({ dir: join(dir, '.raider'), recursive: false })
    ])
    // Still nothing to show
    expect(f.sent).toEqual([])
  })

  it('re-arms when the watched folder goes away, and says so once', async () => {
    const f = fakes()
    await started(f)
    await rm(schedulesDir(), { recursive: true })
    f.watches[0].error()
    f.flush()
    await watcher!.idle()
    expect(f.watches[0].closed).toBe(true)
    expect(f.watches[1]).toMatchObject({ dir: join(dir, '.raider'), recursive: false })
    expect(f.sent).toEqual(['schedules-changed'])
  })

  it('never watches or reads a linked .raider/schedules or .raider', async () => {
    const outside = await realpath(await mkdtemp(join(tmpdir(), 'schedule-outside-')))
    try {
      await mkdir(join(outside, 'nightly'))
      await writeFile(
        join(outside, 'schedules.yml'),
        'schedules:\n- name: nightly\n  notify: false\n'
      )
      await rm(schedulesDir(), { recursive: true })
      await symlink(outside, schedulesDir())
      const f = fakes()
      await started(f)
      expect(f.watches.filter((w) => w.recursive)).toHaveLength(0)
      await writeFile(join(outside, 'nightly', 'runs.jsonl'), line())
      await change(f)
      expect(f.notes).toHaveLength(0)
      expect(f.sent).toEqual([])
      watcher!.stop()

      await rm(join(dir, '.raider'), { recursive: true })
      await symlink(outside, join(dir, '.raider'))
      const g = fakes()
      watcher = createScheduleWatcher(dir, g.deps)
      await watcher.idle()
      expect(g.watches.filter((w) => w.recursive)).toHaveLength(0)
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })

  it('refuses a .raider/schedules that is a link to a folder inside the project', async () => {
    await rm(schedulesDir(), { recursive: true })
    await mkdir(join(dir, 'elsewhere', 'nightly'), { recursive: true })
    await writeFile(
      join(dir, 'elsewhere', 'schedules.yml'),
      'schedules:\n- name: nightly\n  notify: false\n'
    )
    await symlink(join(dir, 'elsewhere'), schedulesDir())
    const f = fakes()
    await started(f)
    expect(f.watches.filter((w) => w.recursive)).toHaveLength(0)
    await writeFile(join(dir, 'elsewhere', 'nightly', 'runs.jsonl'), line())
    await change(f)
    expect(f.notes).toHaveLength(0)
  })

  it('a real folder swapped for a link mid-watch is not read, and a link replaced later arms', async () => {
    // Inside the project, so only the folder check refuses it (not the log's inside-the-project check)
    const outside = join(dir, 'elsewhere')
    await mkdir(outside)
    try {
      const f = fakes()
      await started(f)
      await mkdir(join(outside, 'nightly'))
      await writeFile(
        join(outside, 'schedules.yml'),
        'schedules:\n- name: nightly\n  notify: false\n'
      )
      await writeFile(join(outside, 'nightly', 'runs.jsonl'), line())
      await rm(schedulesDir(), { recursive: true })
      await symlink(outside, schedulesDir())
      await change(f)
      expect(f.notes).toHaveLength(0)
      expect(f.sent).not.toContain('scheduled-run-finished')
      expect(f.watches.filter((w) => !w.closed)).toEqual([
        expect.objectContaining({ dir: join(dir, '.raider'), recursive: false })
      ])

      await rm(schedulesDir())
      await mkdir(join(schedulesDir(), 'nightly'), { recursive: true })
      await change(f)
      expect(f.watches.filter((w) => !w.closed)).toEqual([
        expect.objectContaining({ dir: schedulesDir(), recursive: true })
      ])
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })

  it('a linked schedule folder is not read', async () => {
    const outside = await realpath(await mkdtemp(join(tmpdir(), 'schedule-outside-')))
    try {
      await rm(join(schedulesDir(), 'nightly'), { recursive: true })
      await symlink(outside, join(schedulesDir(), 'nightly'))
      const f = fakes()
      await started(f)
      await writeFile(join(outside, 'runs.jsonl'), line())
      await change(f)
      expect(f.notes).toHaveLength(0)
      expect(f.sent).toEqual(['schedules-changed'])
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })

  it('a stop while arming (a project switch mid-await) leaves no watch open', async () => {
    for (let ticks = 0; ticks < 12; ticks++) {
      const f = fakes()
      const w = createScheduleWatcher(dir, f.deps)
      for (let i = 0; i < ticks; i++) await new Promise((r) => setImmediate(r))
      w.stop()
      await w.idle()
      expect(open(f), `after ${ticks} ticks`).toEqual([])
    }
  })

  it('stop closes the watch and nothing more is sent', async () => {
    const f = fakes()
    await started(f)
    await appendFile(log(), line())
    f.watches[0].fire()
    watcher!.stop()
    f.flush()
    await watcher!.idle()
    expect(f.watches[0].closed).toBe(true)
    expect(f.sent).toEqual([])
    expect(f.notes).toEqual([])
  })

  it('a project switch closes the old watcher and watches only the new project; stop ends it', async () => {
    const other = await realpath(await mkdtemp(join(tmpdir(), 'schedule-other-')))
    try {
      await mkdir(join(other, '.raider', 'schedules'), { recursive: true })
      const f = fakes()
      startScheduleWatcher(dir, f.deps)
      await vi.waitFor(() => expect(f.watches).toHaveLength(1))
      startScheduleWatcher(other, f.deps)
      await vi.waitFor(() => expect(f.watches).toHaveLength(2))
      expect(f.watches[0]).toMatchObject({ dir: schedulesDir(), closed: true })
      expect(f.watches[1]).toMatchObject({
        dir: join(other, '.raider', 'schedules'),
        closed: false
      })
      // The same project again keeps its watcher
      startScheduleWatcher(other, f.deps)
      stopScheduleWatcher()
      expect(f.watches).toHaveLength(2)
      expect(f.watches[1].closed).toBe(true)
    } finally {
      await rm(other, { recursive: true, force: true })
    }
  })
})
