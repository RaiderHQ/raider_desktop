import { describe, it, expect, vi, beforeEach } from 'vitest'
import toast from 'react-hot-toast'
import { useRunStore } from '@foundation/Stores/runStore'
import useRubyStore from '@foundation/Stores/rubyStore'
import { saveRunSettings } from '@foundation/run/runSettings'

vi.mock('@foundation/Stores/projectStore', () => ({
  default: { getState: () => ({ projectPath: '/proj' }) }
}))
vi.mock('i18next', () => ({ default: { t: (key: string) => key } }))
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn() } }))

const api = {
  startRun: vi.fn(),
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
  useRunStore.setState({ run: null, origin: null, isActive: false })
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
    saveRunSettings('/proj', { parallel: true, workers: 3, quarantinedFails: true })
    api.startRun.mockResolvedValue({ runId: 'r1' })
    await useRunStore.getState().start(scope, origin)
    expect(api.startRun).toHaveBeenCalledWith({
      scope,
      workers: 3,
      rubyCommand: 'ruby',
      quarantinedFails: true
    })
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
