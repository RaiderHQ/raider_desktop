import { describe, it, expect, afterEach } from 'vitest'
import { vi } from 'vitest'
import { mkdtemp, mkdir, writeFile, appendFile, rename, rm, realpath } from 'fs/promises'
import { watch as fsWatch } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', () => ({ Notification: class {} }))

import {
  createScheduleWatcher,
  type ScheduleWatcher
} from '../../src/main/handlers/schedules/scheduleWatcher'

let dir = ''
let watcher: ScheduleWatcher | null = null
afterEach(async () => {
  watcher?.stop()
  await rm(dir, { recursive: true, force: true })
})

describe('scheduleWatcher with the real fs.watch', () => {
  it('arms on a new project as the gem makes .raider/schedules, and reports a failed run', async () => {
    dir = await realpath(await mkdtemp(join(tmpdir(), 'schedule-real-')))
    const sent: string[] = []
    const bodies: string[] = []
    watcher = createScheduleWatcher(dir, {
      watch: (d, options, listener) => fsWatch(d, options, (_e, f) => listener(f ?? null)),
      notifications: {
        isSupported: () => true,
        create: ({ body }) => {
          bodies.push(body)
          const nothing = (): void => undefined
          return { on: nothing, show: nothing, close: nothing }
        }
      },
      mainWindow: () => ({
        isDestroyed: (): boolean => false,
        isMinimized: (): boolean => false,
        restore: (): void => undefined,
        show: (): void => undefined,
        focus: (): void => undefined,
        webContents: {
          isDestroyed: (): boolean => false,
          send: (c: string): void => void sent.push(c)
        }
      }),
      setTimer: (cb, ms) => setTimeout(cb, ms),
      clearTimer: (t) => clearTimeout(t as ReturnType<typeof setTimeout>)
    })
    await watcher.idle()
    // fs.watch (FSEvents on macOS) can miss what happens in its first moments; a project's
    // .raider/schedules/ comes from a later `schedule add`
    await new Promise((r) => setTimeout(r, 300))
    await mkdir(join(dir, '.raider', 'schedules', 'nightly'), { recursive: true })
    const tmp = join(dir, '.raider', 'schedules', '.schedules.yml.abc.tmp')
    await writeFile(tmp, 'schedules:\n- name: nightly\n  notify: false\n')
    await rename(tmp, join(dir, '.raider', 'schedules', 'schedules.yml'))
    // Give the arm time to watch the new folder before the run line lands
    await vi.waitFor(() => expect(sent).toContain('schedules-changed'), { timeout: 5000 })
    await appendFile(
      join(dir, '.raider', 'schedules', 'nightly', 'runs.jsonl'),
      JSON.stringify({
        run_id: 'abcdefabcdef0123',
        started_at: 'x',
        status: 'failed',
        counts: { total: 2, passed: 1, failed: 1, skipped: 0 },
        trigger: 'schedule'
      }) + '\n'
    )
    await vi.waitFor(() => expect(sent).toContain('scheduled-run-finished'), { timeout: 5000 })
    expect(bodies).toEqual(['nightly: 1 of 2 tests failed'])
  }, 15000)
})
