import { create } from 'zustand'
import toast from 'react-hot-toast'
import i18n from 'i18next'
import useProjectStore from '@foundation/Stores/projectStore'
import useRubyStore from '@foundation/Stores/rubyStore'
import { loadRunSettings, loginStateFor, workersFor } from '@foundation/run/runSettings'
import { notifyRunFinished } from '@foundation/run/notifyRunFinished'
import { reduceRun, viewFromActiveRun, type RunView } from '@foundation/run/runModel'
import type { RunEvent, RunScope, StartRunResult } from '@shared/types/runEvents'
import type { GemCliError } from '@shared/types/schedules'

/** Where a run was started from, so the panel can link back to it. */
export interface RunOrigin {
  route: string
  label: string
}

interface RunStore {
  run: RunView | null
  origin: RunOrigin | null
  isActive: boolean
  freshLoginNext: boolean
  /** The run panel shows only its summary line; kept for the app session, never saved */
  resultsCollapsed: boolean
  setResultsCollapsed: (v: boolean) => void
  /** startedAt of the run Record hid; a later run has a new one and shows again */
  hiddenRunStartedAt: string | null
  hideCurrentRun: () => void
  setFreshLoginNext: (v: boolean) => void
  ingest: (e: RunEvent) => void
  restore: () => Promise<void>
  start: (scope: RunScope, origin: RunOrigin) => Promise<StartOutcome>
  /** Run now: runs the schedule's tests as a normal run; main reads the schedule itself */
  startSchedule: (name: string, origin: RunOrigin) => Promise<StartOutcome>
  cancel: () => Promise<void>
  /**
   * When a scheduled run of `projectPath` last wrote raider-results (main's watcher); the
   * Dashboard reloads on it as it does on run.finished. `at` only grows, so each one is new.
   */
  scheduledRunAt: { projectPath: string; at: number } | null
  scheduledRunFinished: (projectPath: string) => void
}

type StartOutcome = 'started' | 'busy' | 'error'

// Run now's gem codes, as the Schedules panel shows them
const SCHEDULE_ERRORS: Record<string, string> = {
  needs42: 'schedules.errors.needs42',
  rubyCantRun: 'schedules.errors.rubyCantRun',
  ruby: 'schedules.noRuby'
}

/** The toast for a refused start, and whether it was busy (another run going). */
function refusal(result: { error: string; name?: string; message?: string }): {
  text: string
  busy: boolean
} {
  if (result.error === 'busy') return { text: i18n.t('run.busy'), busy: true }
  if (result.error === 'scheduleBusy') {
    // The copy names the scheduled run; without a valid name the plain busy line reads better
    const text = result.name
      ? i18n.t('schedules.errors.busy', { name: result.name })
      : i18n.t('run.busy')
    return { text, busy: true }
  }
  return { text: result.message ?? result.error, busy: false }
}

// The app uses a hash router, so setting the hash navigates without needing router access here
const navigateTo = (to: string): void => {
  window.location.hash = to
}

const isActiveRun = (run: RunView | null): boolean => run !== null && run.finished === null

type RunFields = {
  workers?: number
  quarantinedFails: boolean
  loginState?: 'off' | 'refresh'
}

export const useRunStore = create<RunStore>((set, get): RunStore => {
  /** Starts a run with the project's run settings; `send` makes the call. */
  const launch = async (
    origin: RunOrigin,
    scope: RunScope,
    send: (
      rubyCommand: string,
      fields: RunFields
    ) => Promise<StartRunResult | (GemCliError & { name?: string })>
  ): Promise<StartOutcome> => {
    const rubyCommand = useRubyStore.getState().rubyCommand
    const { projectPath } = useProjectStore.getState()
    if (!rubyCommand || !projectPath) {
      toast.error(i18n.t('recorder.noRuby'))
      return 'error'
    }
    try {
      const settings = loadRunSettings(projectPath)
      const defaults = await window.api.getRunDefaults()
      const loginState = loginStateFor(settings, get().freshLoginNext)
      const result = await send(rubyCommand, {
        workers: workersFor(settings, defaults, scope),
        quarantinedFails: settings.quarantinedFails,
        ...(loginState ? { loginState } : {})
      })
      if ('runId' in result) {
        set({ origin, freshLoginNext: false })
        return 'started'
      }
      const { text, busy } = refusal(result)
      toast.error(text)
      return busy ? 'busy' : 'error'
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
      return 'error'
    }
  }

  return {
    run: null,
    origin: null,
    isActive: false,
    freshLoginNext: false,
    resultsCollapsed: false,
    scheduledRunAt: null,
    scheduledRunFinished: (projectPath: string): void => {
      if (typeof projectPath !== 'string') return
      const previous = get().scheduledRunAt?.at ?? 0
      set({ scheduledRunAt: { projectPath, at: Math.max(Date.now(), previous + 1) } })
    },
    setResultsCollapsed: (v: boolean): void => set({ resultsCollapsed: v }),
    hiddenRunStartedAt: null,
    hideCurrentRun: (): void => set({ hiddenRunStartedAt: get().run?.startedAt ?? null }),
    setFreshLoginNext: (v: boolean): void => set({ freshLoginNext: v }),
    ingest: (e: RunEvent): void => {
      const run = reduceRun(get().run, e, useProjectStore.getState().projectPath ?? undefined)
      set({ run, isActive: isActiveRun(run) })
      if (e.type === 'run:finished' && run && run.runId === e.runId) {
        notifyRunFinished(run, get().origin, navigateTo)
      }
    },
    restore: async (): Promise<void> => {
      try {
        const active = await window.api.getActiveRun()
        if (!active) return
        // The snapshot already holds any events that arrived while this was in flight
        const run = viewFromActiveRun(active)
        if (!run) return
        // The origin doesn't survive a reload, so the run goes back to the page that shows the project
        const origin = get().origin ?? { route: '/overview', label: i18n.t('run.originProject') }
        set({ run, origin, isActive: isActiveRun(run) })
      } catch (error) {
        console.error('Restoring the active run failed:', error)
      }
    },
    start: (scope: RunScope, origin: RunOrigin): Promise<StartOutcome> =>
      launch(origin, scope, async (rubyCommand, fields) =>
        window.api.startRun({ scope, rubyCommand, ...fields })
      ),
    startSchedule: (name: string, origin: RunOrigin): Promise<StartOutcome> =>
      // Workers as for a whole-project run; main runs a one-file schedule serially
      launch(origin, { kind: 'all' }, async (rubyCommand, fields) => {
        const result = await window.api.runScheduleNow(rubyCommand, { name, ...fields })
        if ('runId' in result || result.error === 'busy' || result.error === 'scheduleBusy')
          return result
        const copy = SCHEDULE_ERRORS[result.error]
        const message = copy
          ? i18n.t(copy)
          : ('message' in result && result.message) || i18n.t('schedules.cliFailed')
        return { error: result.error, message }
      }),
    cancel: async (): Promise<void> => {
      const run = get().run
      if (!run || run.finished) return
      try {
        await window.api.cancelRun(run.runId)
      } catch (error) {
        console.error('Cancelling the run failed:', error)
      }
    }
  }
})

/**
 * Feeds run events (and scheduled runs that finished) into the store once, then restores a run
 * already in progress. Returns one function removing both subscriptions.
 */
export function subscribeRunEvents(): () => void {
  const offRun = window.api.onRunEvent((e) => useRunStore.getState().ingest(e))
  const offScheduled = window.api.onScheduledRunFinished((projectPath) =>
    useRunStore.getState().scheduledRunFinished(projectPath)
  )
  void useRunStore.getState().restore()
  return (): void => {
    offRun()
    offScheduled()
  }
}
