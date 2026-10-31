import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useRunStore, subscribeRunEvents } from '@foundation/Stores/runStore'
import type { ActiveRun, RunEvent } from '@shared/types/runEvents'

vi.mock('@foundation/Stores/projectStore', () => ({
  default: { getState: () => ({ projectPath: '/proj' }) }
}))

const events: RunEvent[] = [
  {
    type: 'run:started',
    runId: 'r1',
    startedAt: 't',
    framework: 'rspec',
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

const api = { getActiveRun: vi.fn(), onRunEvent: vi.fn() }

beforeEach(() => {
  useRunStore.setState({ run: null, origin: null, isActive: false })
  api.getActiveRun.mockReset()
  api.onRunEvent.mockReset()
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

  it('subscribes exactly one listener and returns its unsubscribe', () => {
    const off = vi.fn()
    api.onRunEvent.mockReturnValue(off)
    api.getActiveRun.mockResolvedValue(null)
    expect(subscribeRunEvents()).toBe(off)
    expect(api.onRunEvent).toHaveBeenCalledTimes(1)
    const listener = api.onRunEvent.mock.calls[0][0]
    listener(events[0])
    expect(useRunStore.getState().run?.runId).toBe('r1')
  })
})
