import { describe, it, expect, vi, beforeEach } from 'vitest'
import toast from 'react-hot-toast'
import { useRunStore } from '@foundation/Stores/runStore'
import useRubyStore from '@foundation/Stores/rubyStore'
import { saveRunSettings } from '@foundation/run/runSettings'

const project = vi.hoisted(() => ({
  state: { projectPath: '/proj' as string | null, layout: null as { automation: string } | null }
}))
vi.mock('@foundation/Stores/projectStore', () => ({
  default: { getState: () => project.state, subscribe: () => (): void => {} }
}))
vi.mock('i18next', () => ({
  default: {
    t: (key: string, opts?: { name?: string }): string => (opts?.name ? `${key}:${opts.name}` : key)
  }
}))
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn() } }))

const api = {
  startRun: vi.fn(),
  runScheduleNow: vi.fn(),
  getRunDefaults: vi.fn(),
  cancelRun: vi.fn(),
  getActiveRun: vi.fn()
}
const origin = { route: '/overview/tests', label: 'Tests' }
const scope = { kind: 'all' } as const

beforeEach(() => {
  localStorage.clear()
  vi.mocked(toast.error).mockClear()
  Object.values(api).forEach((f) => f.mockReset())
  api.getRunDefaults.mockResolvedValue({ recommendedWorkers: 2, maxWorkers: 4 })
  ;(window as unknown as { api: typeof api }).api = api
  useRubyStore.setState({ rubyCommand: 'ruby' })
  project.state = { projectPath: '/proj', layout: null }
  useRunStore.setState({
    run: null,
    origin: null,
    isActive: false,
    freshLoginNext: false
  })
})

describe('runStore.start', () => {
  it('sets the origin when started', async () => {
    api.startRun.mockResolvedValue({ runId: 'r1' })
    expect(await useRunStore.getState().start(scope, origin)).toBe('started')
    expect(useRunStore.getState().origin).toEqual(origin)
  })
  it('toasts run.busy when busy', async () => {
    api.startRun.mockResolvedValue({ error: 'busy' })
    expect(await useRunStore.getState().start(scope, origin)).toBe('busy')
    expect(toast.error).toHaveBeenCalledWith('run.busy')
    expect(useRunStore.getState().origin).toBeNull()
  })
  it('toasts schedules.errors.busy with the name while a scheduled run holds the project', async () => {
    api.startRun.mockResolvedValue({ error: 'scheduleBusy', name: 'nightly' })
    expect(await useRunStore.getState().start(scope, origin)).toBe('busy')
    expect(toast.error).toHaveBeenCalledWith('schedules.errors.busy:nightly')
    expect(useRunStore.getState().origin).toBeNull()
  })
  it('falls back to run.busy when the scheduled run has no name', async () => {
    api.startRun.mockResolvedValue({ error: 'scheduleBusy' })
    expect(await useRunStore.getState().start(scope, origin)).toBe('busy')
    expect(toast.error).toHaveBeenCalledWith('run.busy')
  })
  it('toasts schedules.errors.runningWrite when running.json cannot be written', async () => {
    api.startRun.mockResolvedValue({ error: 'runningWriteFailed' })
    expect(await useRunStore.getState().start(scope, origin)).toBe('error')
    expect(toast.error).toHaveBeenCalledWith('schedules.errors.runningWrite')
    expect(useRunStore.getState().origin).toBeNull()
  })
  it('toasts other errors and stays inactive', async () => {
    api.startRun.mockResolvedValue({ error: 'Not a project test: x' })
    expect(await useRunStore.getState().start(scope, origin)).toBe('error')
    expect(toast.error).toHaveBeenCalledWith('Not a project test: x')
    expect(useRunStore.getState().isActive).toBe(false)
  })
  it('handles a thrown error the same way', async () => {
    api.startRun.mockRejectedValue(new Error('boom'))
    expect(await useRunStore.getState().start(scope, origin)).toBe('error')
    expect(toast.error).toHaveBeenCalledWith('boom')
    expect(useRunStore.getState().isActive).toBe(false)
  })
  it('errors with recorder.noRuby when there is no ruby command', async () => {
    useRubyStore.setState({ rubyCommand: null })
    expect(await useRunStore.getState().start(scope, origin)).toBe('error')
    expect(toast.error).toHaveBeenCalledWith('recorder.noRuby')
    expect(api.startRun).not.toHaveBeenCalled()
  })
  it('sends the settings workers and quarantinedFails', async () => {
    project.state = { projectPath: '/proj', layout: { automation: 'selenium' } }
    saveRunSettings('/proj', {
      parallel: true,
      workers: 3,
      quarantinedFails: true,
      reuseLogins: true
    })
    api.startRun.mockResolvedValue({ runId: 'r1' })
    await useRunStore.getState().start(scope, origin)
    expect(api.startRun).toHaveBeenCalledWith({
      scope,
      workers: 3,
      rubyCommand: 'ruby',
      quarantinedFails: true
    })
  })
  it('sends loginState off when reuse is off', async () => {
    saveRunSettings('/proj', {
      parallel: false,
      workers: null,
      quarantinedFails: false,
      reuseLogins: false
    })
    api.startRun.mockResolvedValue({ runId: 'r1' })
    await useRunStore.getState().start(scope, origin)
    expect(api.startRun.mock.calls[0][0].loginState).toBe('off')
  })
  it('sends refresh once, then nothing', async () => {
    api.startRun.mockResolvedValue({ runId: 'r1' })
    useRunStore.getState().setFreshLoginNext(true)
    await useRunStore.getState().start(scope, origin)
    expect(api.startRun.mock.calls[0][0].loginState).toBe('refresh')
    expect(useRunStore.getState().freshLoginNext).toBe(false)
    await useRunStore.getState().start(scope, origin)
    expect('loginState' in api.startRun.mock.calls[1][0]).toBe(false)
  })
  it('keeps freshLoginNext on busy and error', async () => {
    useRunStore.getState().setFreshLoginNext(true)
    api.startRun.mockResolvedValue({ error: 'busy' })
    await useRunStore.getState().start(scope, origin)
    expect(useRunStore.getState().freshLoginNext).toBe(true)
    api.startRun.mockResolvedValue({ error: 'nope' })
    await useRunStore.getState().start(scope, origin)
    expect(useRunStore.getState().freshLoginNext).toBe(true)
    api.startRun.mockRejectedValue(new Error('boom'))
    await useRunStore.getState().start(scope, origin)
    expect(useRunStore.getState().freshLoginNext).toBe(true)
  })
})

describe('runStore.start, before the layout is known', () => {
  const parallel = {
    parallel: true,
    workers: 3,
    quarantinedFails: false,
    reuseLogins: false
  }
  beforeEach(() => {
    project.state = { projectPath: '/proj', layout: null }
    saveRunSettings('/proj', parallel)
    api.startRun.mockResolvedValue({ runId: 'r1' })
  })

  it('runs with the saved workers', async () => {
    expect(await useRunStore.getState().start(scope, origin)).toBe('started')
    expect(api.startRun.mock.calls[0][0].workers).toBe(3)
  })

  it('sends the login state', async () => {
    expect(await useRunStore.getState().start(scope, origin)).toBe('started')
    expect(api.startRun.mock.calls[0][0].loginState).toBe('off')
  })
})

describe('runStore finish hook', () => {
  const started = {
    type: 'run:started',
    runId: 'r1',
    startedAt: 't',
    scope,
    workers: 1,
    liveEvents: true
  } as const
  const finished = {
    type: 'run:finished',
    runId: 'r1',
    finishedAt: 't',
    exitCode: 0,
    status: 'passed',
    counts: { total: 1, passed: 1, failed: 0, quarantined: 0, pending: 0, skipped: 0 }
  } as const

  it('notifies once per run:finished, and not for a restored one', async () => {
    const shown: unknown[] = []
    vi.stubGlobal(
      'Notification',
      class {
        constructor(...args: unknown[]) {
          shown.push(args)
        }
      }
    )
    vi.spyOn(document, 'hasFocus').mockReturnValue(false)
    useRunStore.getState().ingest(started)
    useRunStore.getState().ingest(finished)
    expect(shown).toHaveLength(1)

    shown.length = 0
    api.getActiveRun = vi.fn().mockResolvedValue({
      runId: 'r1',
      projectPath: '/proj',
      request: { scope, rubyCommand: 'ruby' },
      events: [started, finished]
    })
    await useRunStore.getState().restore()
    expect(shown).toHaveLength(0)
    vi.unstubAllGlobals()
  })
})

describe('runStore.startSchedule', () => {
  const scheduleOrigin = { route: '/overview', label: 'nightly' }

  it('sends the name and the usual run settings, never a scope or headed', async () => {
    saveRunSettings('/proj', {
      parallel: true,
      workers: 3,
      quarantinedFails: true,
      reuseLogins: false
    })
    api.runScheduleNow.mockResolvedValue({ runId: 'r1' })
    expect(await useRunStore.getState().startSchedule('nightly', scheduleOrigin)).toBe('started')
    expect(api.runScheduleNow).toHaveBeenCalledWith('ruby', {
      name: 'nightly',
      workers: 3,
      quarantinedFails: true,
      loginState: 'off'
    })
    expect(useRunStore.getState().origin).toEqual(scheduleOrigin)
    expect(api.startRun).not.toHaveBeenCalled()
  })

  it.each([
    [{ error: 'busy' }, 'busy', 'run.busy'],
    [{ error: 'scheduleBusy', name: 'other' }, 'busy', 'schedules.errors.busy:other'],
    [{ error: 'runningWriteFailed' }, 'error', 'schedules.errors.runningWrite'],
    [{ error: 'needs42' }, 'error', 'schedules.errors.needs42'],
    [{ error: 'rubyCantRun' }, 'error', 'schedules.errors.rubyCantRun'],
    [{ error: 'ruby' }, 'error', 'schedules.noRuby'],
    [{ error: 'refused', message: 'Invalid tag: x' }, 'error', 'Invalid tag: x'],
    [{ error: 'timeout' }, 'error', 'schedules.cliFailed']
  ])('maps %j', async (result, outcome, toastText) => {
    api.runScheduleNow.mockResolvedValue(result)
    expect(await useRunStore.getState().startSchedule('nightly', scheduleOrigin)).toBe(outcome)
    expect(toast.error).toHaveBeenCalledWith(toastText)
    expect(useRunStore.getState().origin).toBeNull()
  })
})
