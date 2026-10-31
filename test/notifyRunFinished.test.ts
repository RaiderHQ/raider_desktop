import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { notifyRunFinished } from '@foundation/run/notifyRunFinished'
import type { RunView } from '@foundation/run/runModel'

const run = {
  runId: 'r',
  finished: {
    status: 'failed',
    counts: { total: 40, passed: 38, failed: 2, quarantined: 0, pending: 0, skipped: 0 },
    exitCode: 1,
    finishedAt: 't'
  }
} as unknown as RunView

const instances: { title: string; opts: { body: string }; onclick: (() => void) | null }[] = []
class FakeNotification {
  onclick: (() => void) | null = null
  constructor(
    public title: string,
    public opts: { body: string }
  ) {
    instances.push(this)
  }
}

beforeEach(() => {
  instances.length = 0
  vi.stubGlobal('Notification', FakeNotification)
  vi.spyOn(window, 'focus').mockImplementation(() => {})
})
afterEach(() => vi.unstubAllGlobals())

describe('notifyRunFinished', () => {
  it('shows nothing while the window is focused', () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    notifyRunFinished(run, null, vi.fn())
    expect(instances).toHaveLength(0)
  })
  it('shows the counts when unfocused, and clicking navigates to the origin', () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(false)
    const navigate = vi.fn()
    notifyRunFinished(run, { route: '/overview/tests', label: 'Tests' }, navigate)
    expect(instances).toHaveLength(1)
    expect(instances[0].opts.body).toBe('38 passed, 2 failed')
    instances[0].onclick?.()
    expect(window.focus).toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledWith('/overview/tests')
  })
  it('falls back to /overview without an origin', () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(false)
    const navigate = vi.fn()
    notifyRunFinished(run, null, navigate)
    instances[0].onclick?.()
    expect(navigate).toHaveBeenCalledWith('/overview')
  })
})
