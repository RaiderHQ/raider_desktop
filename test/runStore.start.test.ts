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
vi.mock('i18next', () => ({ default: { t: (key: string) => key } }))
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn() } }))

const api = {
  startRun: vi.fn(),
  getRunDefaults: vi.fn(),
  cancelRun: vi.fn(),
  getActiveRun: vi.fn(),
  checkMobileReady: vi.fn()
}
const origin = { route: '/overview/tests', label: 'Tests' }
const scope = { kind: 'all' } as const

beforeEach(() => {
  localStorage.clear()
  vi.mocked(toast.error).mockClear()
  Object.values(api).forEach((f) => f.mockReset())
  api.getRunDefaults.mockResolvedValue({ recommendedWorkers: 2, maxWorkers: 4 })
  // Main answers ok for web projects
  api.checkMobileReady.mockResolvedValue({ ok: true })
  ;(window as unknown as { api: typeof api }).api = api
  useRubyStore.setState({ rubyCommand: 'ruby' })
  project.state = { projectPath: '/proj', layout: null }
  useRunStore.setState({
    run: null,
    origin: null,
    isActive: false,
    freshLoginNext: false,
    notReady: null,
    deviceFocusRequested: false,
    checking: false
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

describe('runStore.start, mobile projects', () => {
  const parallel = {
    parallel: true,
    workers: 3,
    quarantinedFails: false,
    reuseLogins: true
  }
  beforeEach(() => {
    project.state = { projectPath: '/proj', layout: { automation: 'appium' } }
    api.startRun.mockResolvedValue({ runId: 'r1' })
  })

  it('does not run when Appium is unreachable, and says why', async () => {
    api.checkMobileReady.mockResolvedValue({
      ok: false,
      reason: 'appium',
      detail: '127.0.0.1:4723'
    })
    expect(await useRunStore.getState().start(scope, origin)).toBe('error')
    expect(api.checkMobileReady).toHaveBeenCalledWith('/proj')
    expect(api.startRun).not.toHaveBeenCalled()
    expect(useRunStore.getState().notReady).toEqual({
      reason: 'appium',
      detail: '127.0.0.1:4723',
      scope,
      origin,
      projectPath: '/proj'
    })
    expect(useRunStore.getState().origin).toBeNull()
  })

  it('runs serially when ready, even with parallel saved', async () => {
    saveRunSettings('/proj', parallel)
    api.checkMobileReady.mockResolvedValue({ ok: true })
    expect(await useRunStore.getState().start(scope, origin)).toBe('started')
    expect(api.startRun.mock.calls[0][0].workers).toBeUndefined()
    expect(useRunStore.getState().notReady).toBeNull()
  })

  it('skips the check when asked, and still runs serially', async () => {
    saveRunSettings('/proj', parallel)
    expect(await useRunStore.getState().start(scope, origin, { skipMobileCheck: true })).toBe(
      'started'
    )
    expect(api.checkMobileReady).not.toHaveBeenCalled()
    expect(api.startRun.mock.calls[0][0].workers).toBeUndefined()
  })

  it('clears an earlier not-ready on the next start', async () => {
    api.checkMobileReady.mockResolvedValueOnce({ ok: false, reason: 'app', detail: '' })
    await useRunStore.getState().start(scope, origin)
    expect(useRunStore.getState().notReady?.reason).toBe('app')
    api.checkMobileReady.mockResolvedValueOnce({ ok: true })
    await useRunStore.getState().start(scope, origin)
    expect(useRunStore.getState().notReady).toBeNull()
  })

  it('dismissNotReady clears it', async () => {
    api.checkMobileReady.mockResolvedValue({ ok: false, reason: 'app', detail: '/a.app' })
    await useRunStore.getState().start(scope, origin)
    useRunStore.getState().dismissNotReady()
    expect(useRunStore.getState().notReady).toBeNull()
  })

  it('toasts a plain message when the check itself fails', async () => {
    api.checkMobileReady.mockResolvedValue({ error: 'ipc exploded' })
    expect(await useRunStore.getState().start(scope, origin)).toBe('error')
    expect(toast.error).toHaveBeenCalledWith('run.mobile.checkFailed')
    expect(api.startRun).not.toHaveBeenCalled()
    expect(useRunStore.getState().notReady).toBeNull()
  })

  it('toasts the same plain message when the check throws', async () => {
    api.checkMobileReady.mockRejectedValue(new Error('ipc exploded'))
    expect(await useRunStore.getState().start(scope, origin)).toBe('error')
    expect(toast.error).toHaveBeenCalledWith('run.mobile.checkFailed')
    expect(toast.error).toHaveBeenCalledTimes(1)
    expect(api.startRun).not.toHaveBeenCalled()
  })

  it('drops the answer silently when the project changed during the check', async () => {
    let answer: (r: unknown) => void = () => {}
    api.checkMobileReady.mockReturnValue(new Promise((resolve) => (answer = resolve)))
    const started = useRunStore.getState().start(scope, origin)
    project.state = { projectPath: '/other', layout: { automation: 'appium' } }
    answer({ ok: false, reason: 'appium', detail: '127.0.0.1:4723' })
    expect(await started).toBe('error')
    expect(api.startRun).not.toHaveBeenCalled()
    expect(useRunStore.getState().notReady).toBeNull()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('does not start a ready run for a project that is no longer open', async () => {
    let answer: (r: unknown) => void = () => {}
    api.checkMobileReady.mockReturnValue(new Promise((resolve) => (answer = resolve)))
    const started = useRunStore.getState().start(scope, origin)
    project.state = { projectPath: '/other', layout: null }
    answer({ ok: true })
    expect(await started).toBe('error')
    expect(api.startRun).not.toHaveBeenCalled()
  })
})

describe('runStore.start, web projects', () => {
  it('never checks mobile readiness once the layout is known', async () => {
    project.state = { projectPath: '/proj', layout: { automation: 'selenium' } }
    api.startRun.mockResolvedValue({ runId: 'r1' })
    expect(await useRunStore.getState().start(scope, origin)).toBe('started')
    expect(api.checkMobileReady).not.toHaveBeenCalled()
  })
})

describe('runStore.start, before the layout is known', () => {
  beforeEach(() => {
    project.state = { projectPath: '/proj', layout: null }
    api.startRun.mockResolvedValue({ runId: 'r1' })
  })

  it('checks, and does not run a project that turns out not ready', async () => {
    api.checkMobileReady.mockResolvedValue({
      ok: false,
      reason: 'appium',
      detail: '127.0.0.1:4723'
    })
    expect(await useRunStore.getState().start(scope, origin)).toBe('error')
    expect(api.startRun).not.toHaveBeenCalled()
    expect(useRunStore.getState().notReady?.reason).toBe('appium')
  })

  it('checks, then runs with the saved workers when ready', async () => {
    saveRunSettings('/proj', {
      parallel: true,
      workers: 3,
      quarantinedFails: false,
      reuseLogins: true
    })
    expect(await useRunStore.getState().start(scope, origin)).toBe('started')
    expect(api.checkMobileReady).toHaveBeenCalledWith('/proj')
    expect(api.startRun.mock.calls[0][0].workers).toBe(3)
  })
})

describe('runStore.start, one check at a time', () => {
  it('a second start while checking is busy, silently', async () => {
    project.state = { projectPath: '/proj', layout: { automation: 'appium' } }
    api.startRun.mockResolvedValue({ runId: 'r1' })
    let answer: (r: unknown) => void = () => {}
    api.checkMobileReady.mockReturnValue(new Promise((resolve) => (answer = resolve)))
    const first = useRunStore.getState().start(scope, origin)
    expect(useRunStore.getState().checking).toBe(true)
    expect(await useRunStore.getState().start(scope, origin)).toBe('busy')
    answer({ ok: true })
    expect(await first).toBe('started')
    expect(api.checkMobileReady).toHaveBeenCalledTimes(1)
    expect(api.startRun).toHaveBeenCalledTimes(1)
    expect(toast.error).not.toHaveBeenCalled()
    expect(useRunStore.getState().checking).toBe(false)
  })

  it('stops checking when the check fails', async () => {
    project.state = { projectPath: '/proj', layout: { automation: 'appium' } }
    api.checkMobileReady.mockRejectedValue(new Error('boom'))
    await useRunStore.getState().start(scope, origin)
    expect(useRunStore.getState().checking).toBe(false)
  })
})

describe('runStore device focus', () => {
  it('requests and clears focus on the device settings', () => {
    useRunStore.getState().requestDeviceFocus()
    expect(useRunStore.getState().deviceFocusRequested).toBe(true)
    useRunStore.getState().clearDeviceFocus()
    expect(useRunStore.getState().deviceFocusRequested).toBe(false)
  })
})

describe('runStore finish hook', () => {
  const started = {
    type: 'run:started',
    runId: 'r1',
    startedAt: 't',
    framework: 'rspec',
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
