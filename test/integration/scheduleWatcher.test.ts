import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, mkdir, writeFile, appendFile, rm, symlink, realpath } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', () => ({ Notification: class {} }))

import {
  createScheduleWatcher,
  isScheduleChange,
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
      webContents: { isDestroyed: () => false, send: (channel: string) => sent.push(channel) }
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

const line = (patch: Record<string, unknown> = {}): string =>
  JSON.stringify({
    started_at: '2026-11-10T11:12:35.478Z',
    attempt: 1,
    trigger: 'schedule',
    run_id: 'c379fa6246da4274',
    finished_at: '2026-11-10T11:12:37.714Z',
    status: 'failed',
    results_dir: 'flow-results/broken/20261110T111235Z',
    failed_step: { title: 'runs', line: 7 },
    ...patch
  }) + '\n'

let dir: string
let watcher: ScheduleWatcher | null
const log = (name = 'broken'): string => join(dir, '.raider', 'flows', name, 'runs.jsonl')

beforeEach(async () => {
  dir = await realpath(await mkdtemp(join(tmpdir(), 'schedule-watcher-')))
  await mkdir(join(dir, '.raider', 'flows', 'broken'), { recursive: true })
  watcher = null
})

afterEach(async () => {
  watcher?.stop()
  stopScheduleWatcher()
  await rm(dir, { recursive: true, force: true })
})

/** Fires a change and waits for the settled scan */
async function change(f: ReturnType<typeof fakes>): Promise<void> {
  f.watches.filter((w) => !w.closed).forEach((w) => w.fire())
  f.flush()
  await watcher!.idle()
}

describe('scheduleWatcher', () => {
  it('watches .raider/flows recursively', async () => {
    const f = fakes()
    watcher = createScheduleWatcher(dir, f.deps)
    await watcher.idle()
    expect(f.watches).toHaveLength(1)
    expect(f.watches[0]).toMatchObject({ dir: join(dir, '.raider', 'flows'), recursive: true })
  })

  it('does not notify lines that were there at start, only a new failed scheduled one', async () => {
    await writeFile(
      log(),
      line({ run_id: 'aaaaaaaaaaaaaaaa' }) + line({ run_id: 'bbbbbbbbbbbbbbbb' })
    )
    const f = fakes()
    watcher = createScheduleWatcher(dir, f.deps)
    await watcher.idle()
    await change(f)
    expect(f.notes).toHaveLength(0)
    expect(f.sent).toEqual(['schedules-changed'])

    await appendFile(log(), line())
    await change(f)
    expect(f.notes).toEqual([
      expect.objectContaining({ title: SCHEDULE_FAILED_TITLE, body: 'broken failed at line 7' })
    ])
    expect(SCHEDULE_FAILED_TITLE).toBe('Scheduled run failed')
    await change(f)
    expect(f.notes).toHaveLength(1)
  })

  it('does not notify a line again after the gem trims (rewrites) the log', async () => {
    await writeFile(log(), line({ run_id: 'aaaaaaaaaaaaaaaa' }) + line())
    const f = fakes()
    watcher = createScheduleWatcher(dir, f.deps)
    await watcher.idle()
    await writeFile(log(), line())
    await change(f)
    expect(f.notes).toHaveLength(0)
  })

  it('does not notify old lines after a read that caught the log empty or missing', async () => {
    await writeFile(log(), line())
    const f = fakes()
    watcher = createScheduleWatcher(dir, f.deps)
    await watcher.idle()
    await writeFile(log(), '')
    await change(f)
    await rm(log())
    await change(f)
    await writeFile(log(), line())
    await change(f)
    expect(f.notes).toHaveLength(0)
  })

  it('skips completed, busy, and manual or desktop runs; notifies a scheduled setup_error', async () => {
    const f = fakes()
    watcher = createScheduleWatcher(dir, f.deps)
    await watcher.idle()
    await appendFile(
      log(),
      line({ run_id: '1000000000000000', status: 'completed', failed_step: undefined }) +
        line({ run_id: '2000000000000000', status: 'busy' }) +
        line({ run_id: '3000000000000000', trigger: 'desktop' }) +
        line({ run_id: '4000000000000000', trigger: 'manual' }) +
        line({ run_id: '5000000000000000', status: 'setup_error', failed_step: undefined })
    )
    await change(f)
    expect(f.notes.map((n) => n.body)).toEqual(['broken could not start'])
  })

  it('names the step when the flow has a sidecar, else just the flow', async () => {
    const f = fakes()
    watcher = createScheduleWatcher(dir, f.deps)
    await watcher.idle()
    await appendFile(
      log(),
      line({ run_id: '1000000000000000', failed_step: { title: 'x', line: 7, number: 3 } }) +
        line({ run_id: '2000000000000000', failed_step: undefined })
    )
    await change(f)
    expect(f.notes.map((n) => n.body)).toEqual(['broken failed at step 3', 'broken failed'])
  })

  it('keys a line by started_at when run_id is missing or not a run id', async () => {
    const f = fakes()
    watcher = createScheduleWatcher(dir, f.deps)
    await watcher.idle()
    await appendFile(
      log(),
      line({ run_id: undefined, started_at: '2026-11-10T11:00:00.000Z' }) +
        line({ run_id: 'NOT-A-RUN-ID', started_at: '2026-11-10T12:00:00.000Z' })
    )
    await change(f)
    expect(f.notes).toHaveLength(2)
    // The same two lines rewritten (as a trim does) are not new
    await writeFile(
      log(),
      line({ run_id: undefined, started_at: '2026-11-10T11:00:00.000Z' }) +
        line({ run_id: 'NOT-A-RUN-ID', started_at: '2026-11-10T12:00:00.000Z' })
    )
    await change(f)
    expect(f.notes).toHaveLength(2)
  })

  it('debounces: 5 events make one scan and one schedules-changed', async () => {
    const f = fakes()
    watcher = createScheduleWatcher(dir, f.deps)
    await watcher.idle()
    await appendFile(log(), line())
    for (let i = 0; i < 5; i++) f.watches[0].fire()
    expect(f.timers).toBe(5)
    f.flush()
    f.flush()
    await watcher.idle()
    expect(f.sent).toEqual(['schedules-changed'])
    expect(f.notes).toHaveLength(1)
  })

  it('ignores hostile lines and folders; the body holds only the name and integers', async () => {
    await mkdir(join(dir, '.raider', 'flows', 'Bad-Name'), { recursive: true })
    await mkdir(join(dir, '.raider', 'flows', 'env'), { recursive: true })
    const f = fakes()
    watcher = createScheduleWatcher(dir, f.deps)
    await watcher.idle()
    await writeFile(join(dir, '.raider', 'flows', 'Bad-Name', 'runs.jsonl'), line())
    await writeFile(join(dir, '.raider', 'flows', 'env', 'runs.jsonl'), line())
    await appendFile(
      log(),
      '{not json\n' +
        'x'.repeat(300 * 1024) +
        '\n' +
        '[1,2]\n' +
        line({
          run_id: '1000000000000000',
          name: '../../evil',
          failed_step: { title: '<b>evil</b>', number: 1e21, line: '7' },
          message: 'rm -rf /'
        })
    )
    await change(f)
    expect(f.notes.map((n) => n.body)).toEqual(['broken failed'])
  })

  describe('retries (the gem notifies after the last attempt only)', () => {
    const schedules = (retries: unknown): Promise<void> =>
      writeFile(
        join(dir, '.raider', 'flows', 'schedules.yml'),
        // The shape the gem writes (ruby_raider 4.1.0)
        `---\nschedules:\n- name: broken\n  every: day\n  at: '09:30'\n  'on':\n  retries: ${retries}\n  inputs: []\n  notify: false\n- name: other\n  retries: 3\n`
      )

    it('a failed first attempt that a retry fixes is not notified', async () => {
      await schedules(1)
      const f = fakes()
      watcher = createScheduleWatcher(dir, f.deps)
      await watcher.idle()
      await appendFile(
        log(),
        line({ run_id: '1000000000000000', attempt: 1 }) +
          line({ run_id: '2000000000000000', attempt: 2, status: 'completed' })
      )
      await change(f)
      expect(f.notes).toHaveLength(0)
    })

    it('with retries 2 and all three attempts failing, notifies once (the third)', async () => {
      await schedules(2)
      const f = fakes()
      watcher = createScheduleWatcher(dir, f.deps)
      await watcher.idle()
      await appendFile(log(), line({ run_id: '1000000000000000', attempt: 1 }))
      await change(f)
      await appendFile(log(), line({ run_id: '2000000000000000', attempt: 2 }))
      await change(f)
      expect(f.notes).toHaveLength(0)
      await appendFile(
        log(),
        line({ run_id: '3000000000000000', attempt: 3, failed_step: { number: 2 } })
      )
      await change(f)
      expect(f.notes.map((n) => n.body)).toEqual(['broken failed at step 2'])
    })

    it('without schedules.yml (or a bad one) the first attempt is the last', async () => {
      const f = fakes()
      watcher = createScheduleWatcher(dir, f.deps)
      await watcher.idle()
      await appendFile(log(), line({ run_id: '1000000000000000', attempt: 1 }))
      await change(f)
      await writeFile(join(dir, '.raider', 'flows', 'schedules.yml'), 'schedules: [: bad')
      await appendFile(log(), line({ run_id: '2000000000000000', attempt: 1 }))
      await change(f)
      expect(f.notes).toHaveLength(2)
    })

    it('clamps retries to 0..3 and needs a positive integer attempt', async () => {
      await schedules(99)
      const f = fakes()
      watcher = createScheduleWatcher(dir, f.deps)
      await watcher.idle()
      await appendFile(
        log(),
        line({ run_id: '1000000000000000', attempt: 3 }) +
          line({ run_id: '2000000000000000', attempt: 4 }) +
          line({ run_id: '3000000000000000', attempt: '9' }) +
          line({ run_id: '4000000000000000', attempt: undefined })
      )
      await change(f)
      expect(f.notes).toHaveLength(1)
    })

    it('ignores a linked schedules.yml', async () => {
      const outside = await mkdtemp(join(tmpdir(), 'schedule-outside-'))
      try {
        await writeFile(
          join(outside, 'schedules.yml'),
          'schedules:\n- name: broken\n  retries: 3\n'
        )
        await symlink(
          join(outside, 'schedules.yml'),
          join(dir, '.raider', 'flows', 'schedules.yml')
        )
        const f = fakes()
        watcher = createScheduleWatcher(dir, f.deps)
        await watcher.idle()
        await appendFile(log(), line({ run_id: '1000000000000000', attempt: 1 }))
        await change(f)
        expect(f.notes).toHaveLength(1)
      } finally {
        await rm(outside, { recursive: true, force: true })
      }
    })
  })

  describe('which changes count', () => {
    it('only run logs, schedules.yml and flow folders; a missing filename counts', () => {
      expect(isScheduleChange('broken/runs.jsonl')).toBe(true)
      expect(isScheduleChange('schedules.yml')).toBe(true)
      expect(isScheduleChange('broken')).toBe(true)
      expect(isScheduleChange(null)).toBe(true)
      for (const churn of [
        'broken/scheduler.log',
        'broken.lock',
        'env',
        '.schedules.yml.a1b2c3d4e5f6.tmp',
        'Bad-Name/runs.jsonl',
        'broken/sub/runs.jsonl',
        'env/runs.jsonl'
      ])
        expect(isScheduleChange(churn), churn).toBe(false)
    })

    it('scheduler.log and lock churn push no schedules-changed', async () => {
      const f = fakes()
      watcher = createScheduleWatcher(dir, f.deps)
      await watcher.idle()
      f.watches[0].fire('broken/scheduler.log')
      f.watches[0].fire('broken.lock')
      f.watches[0].fire('env')
      expect(f.timers).toBe(0)
      f.flush()
      await watcher.idle()
      expect(f.sent).toEqual([])
      f.watches[0].fire('broken/runs.jsonl')
      f.flush()
      await watcher.idle()
      expect(f.sent).toEqual(['schedules-changed'])
    })
  })

  it('a click shows and focuses the window and asks for the schedules', async () => {
    const f = fakes()
    watcher = createScheduleWatcher(dir, f.deps)
    await watcher.idle()
    await appendFile(log(), line())
    await change(f)
    f.notes[0].click()
    expect(f.win.restore).toHaveBeenCalled()
    expect(f.win.show).toHaveBeenCalled()
    expect(f.win.focus).toHaveBeenCalled()
    expect(f.sent).toEqual(['schedules-changed', 'focus-schedules'])
  })

  it('after stop (a project switch) closes its banners and a late click opens nothing', async () => {
    const f = fakes()
    watcher = createScheduleWatcher(dir, f.deps)
    await watcher.idle()
    await appendFile(log(), line())
    await change(f)
    expect(f.notes).toHaveLength(1)
    watcher.stop()
    expect(f.notes[0].closed).toBe(true)
    f.notes[0].click()
    expect(f.win.focus).not.toHaveBeenCalled()
    expect(f.sent).toEqual(['schedules-changed'])
  })

  it('without .raider/flows watches .raider and arms when it is made', async () => {
    await rm(join(dir, '.raider', 'flows'), { recursive: true })
    const f = fakes()
    watcher = createScheduleWatcher(dir, f.deps)
    await watcher.idle()
    expect(f.watches[0]).toMatchObject({ dir: join(dir, '.raider'), recursive: false })

    await mkdir(join(dir, '.raider', 'flows', 'broken'), { recursive: true })
    await writeFile(log(), line())
    await change(f)
    expect(f.watches[0].closed).toBe(true)
    expect(f.watches[1]).toMatchObject({ dir: join(dir, '.raider', 'flows'), recursive: true })
    // Its first run is news: the folder was not there at start
    expect(f.notes).toHaveLength(1)
  })

  it('without .raider watches the project root', async () => {
    await rm(join(dir, '.raider'), { recursive: true })
    const f = fakes()
    watcher = createScheduleWatcher(dir, f.deps)
    await watcher.idle()
    expect(f.watches[0]).toMatchObject({ dir, recursive: false })
    await mkdir(join(dir, '.raider'))
    await change(f)
    expect(f.watches[1]).toMatchObject({ dir: join(dir, '.raider'), recursive: false })
  })

  it('re-arms when the watched folder goes away', async () => {
    const f = fakes()
    watcher = createScheduleWatcher(dir, f.deps)
    await watcher.idle()
    await rm(join(dir, '.raider', 'flows'), { recursive: true })
    f.watches[0].error()
    f.flush()
    await watcher.idle()
    expect(f.watches[0].closed).toBe(true)
    expect(f.watches[1]).toMatchObject({ dir: join(dir, '.raider'), recursive: false })
  })

  it('never watches a linked .raider/flows or .raider', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'schedule-outside-'))
    try {
      await rm(join(dir, '.raider', 'flows'), { recursive: true })
      await symlink(outside, join(dir, '.raider', 'flows'))
      const f = fakes()
      watcher = createScheduleWatcher(dir, f.deps)
      await watcher.idle()
      expect(f.watches).toHaveLength(0)
      watcher.stop()

      await rm(join(dir, '.raider'), { recursive: true })
      await symlink(outside, join(dir, '.raider'))
      const g = fakes()
      watcher = createScheduleWatcher(dir, g.deps)
      await watcher.idle()
      expect(g.watches).toHaveLength(0)
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })

  it('stop closes the watch and nothing more is sent', async () => {
    const f = fakes()
    watcher = createScheduleWatcher(dir, f.deps)
    await watcher.idle()
    await appendFile(log(), line())
    f.watches[0].fire()
    watcher.stop()
    f.flush()
    await watcher.idle()
    expect(f.watches[0].closed).toBe(true)
    expect(f.sent).toEqual([])
    expect(f.notes).toEqual([])
  })

  it('a project switch closes the old watcher and watches only the new project; quit stops it', async () => {
    const other = await realpath(await mkdtemp(join(tmpdir(), 'schedule-other-')))
    try {
      await mkdir(join(other, '.raider', 'flows'), { recursive: true })
      const f = fakes()
      startScheduleWatcher(dir, f.deps)
      await vi.waitFor(() => expect(f.watches).toHaveLength(1))
      startScheduleWatcher(other, f.deps)
      await vi.waitFor(() => expect(f.watches).toHaveLength(2))
      expect(f.watches[0]).toMatchObject({ dir: join(dir, '.raider', 'flows'), closed: true })
      expect(f.watches[1]).toMatchObject({ dir: join(other, '.raider', 'flows'), closed: false })
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
