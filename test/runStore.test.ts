import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useRunStore, subscribeRunEvents } from '@foundation/Stores/runStore'
import type { ActiveRun, RunEvent } from '@shared/types/runEvents'

vi.mock('i18next', () => ({ default: { t: (key: string) => key } }))
vi.mock('@foundation/Stores/projectStore', () => ({
  default: { getState: () => ({ projectPath: '/proj' }), subscribe: () => (): void => {} }
}))

const events: RunEvent[] = [
  {
    type: 'run:started',
    runId: 'r1',
    startedAt: 't',
    scope: { kind: 'all' },
    workers: 1,
    liveEvents: true
  },
  { type: 'run:phase', runId: 'r1', phase: 'running' },
  {
    type: 'run:planned',
    runId: 'r1',
    tests: [{ id: 'a', file: 'spec/a_spec.rb', line: 3, description: 'a', fullName: 'A a' }]
  }
]
const active: ActiveRun = {
  runId: 'r1',
  projectPath: '/proj',
  request: { scope: { kind: 'all' }, rubyCommand: 'ruby' },
  events
}

const api = { getActiveRun: vi.fn(), onRunEvent: vi.fn(), onScheduledRunFinished: vi.fn() }

beforeEach(() => {
  useRunStore.setState({ run: null, origin: null, isActive: false })
  api.getActiveRun.mockReset()
  api.onRunEvent.mockReset()
  api.onScheduledRunFinished.mockReset()
  ;(window as unknown as { api: typeof api }).api = api
})

describe('runStore', () => {
  it('restores the same view as ingesting the events, and is active', async () => {
    events.forEach((e) => useRunStore.getState().ingest(e))
    const ingested = useRunStore.getState().run
    useRunStore.setState({ run: null, isActive: false })

    api.getActiveRun.mockResolvedValue(active)
    await useRunStore.getState().restore()

    expect(useRunStore.getState().run).toEqual(ingested)
    expect(useRunStore.getState().isActive).toBe(true)
  })

  it('sends a run restored after a reload back to Overview', async () => {
    api.getActiveRun.mockResolvedValue(active)
    await useRunStore.getState().restore()
    expect(useRunStore.getState().origin).toEqual({
      route: '/overview',
      label: 'run.originProject'
    })
  })

  it('keeps the origin a run was started from', async () => {
    useRunStore.setState({ origin: { route: '/tests/7', label: 'Login' } })
    api.getActiveRun.mockResolvedValue(active)
    await useRunStore.getState().restore()
    expect(useRunStore.getState().origin).toEqual({ route: '/tests/7', label: 'Login' })
  })

  it('lets the snapshot win over live events that arrived while it was in flight', async () => {
    let resolve!: (a: ActiveRun) => void
    api.getActiveRun.mockReturnValue(new Promise((r) => (resolve = r)))
    const pending = useRunStore.getState().restore()
    events.forEach((e) => useRunStore.getState().ingest(e))
    resolve(active)
    await pending
    expect(useRunStore.getState().run?.order).toEqual(['a'])
    expect(useRunStore.getState().run?.output).toEqual([])
  })

  it('does nothing when no run is active', async () => {
    api.getActiveRun.mockResolvedValue(null)
    await useRunStore.getState().restore()
    expect(useRunStore.getState().run).toBeNull()
  })

  it('is inactive once the run finishes', () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    events.forEach((e) => useRunStore.getState().ingest(e))
    useRunStore.getState().ingest({
      type: 'run:finished',
      runId: 'r1',
      finishedAt: 't',
      exitCode: 0,
      status: 'passed',
      counts: { total: 1, passed: 1, failed: 0, quarantined: 0, pending: 0, skipped: 0 }
    })
    expect(useRunStore.getState().isActive).toBe(false)
  })

  it('subscribes exactly one run listener and one scheduled-run listener; unsubscribes both', () => {
    const off = vi.fn()
    const offScheduled = vi.fn()
    api.onRunEvent.mockReturnValue(off)
    api.onScheduledRunFinished.mockReturnValue(offScheduled)
    api.getActiveRun.mockResolvedValue(null)
    const unsubscribe = subscribeRunEvents()
    expect(api.onRunEvent).toHaveBeenCalledTimes(1)
    expect(api.onScheduledRunFinished).toHaveBeenCalledTimes(1)
    const listener = api.onRunEvent.mock.calls[0][0]
    listener(events[0])
    expect(useRunStore.getState().run?.runId).toBe('r1')
    unsubscribe()
    expect(off).toHaveBeenCalledTimes(1)
    expect(offScheduled).toHaveBeenCalledTimes(1)
  })

  it('a finished scheduled run stamps scheduledRunAt with its project, a new stamp each time', () => {
    api.onRunEvent.mockReturnValue(vi.fn())
    api.onScheduledRunFinished.mockReturnValue(vi.fn())
    api.getActiveRun.mockResolvedValue(null)
    useRunStore.setState({ scheduledRunAt: null })
    subscribeRunEvents()
    const finished = api.onScheduledRunFinished.mock.calls[0][0]
    finished('/proj')
    const first = useRunStore.getState().scheduledRunAt
    expect(first).toEqual({ projectPath: '/proj', at: expect.any(Number) })
    finished('/proj')
    expect(useRunStore.getState().scheduledRunAt).not.toBe(first)
    expect(useRunStore.getState().scheduledRunAt!.at).toBeGreaterThan(first!.at)
    // Only a string path is taken
    finished(42 as unknown as string)
    expect(useRunStore.getState().scheduledRunAt!.projectPath).toBe('/proj')
  })
})
