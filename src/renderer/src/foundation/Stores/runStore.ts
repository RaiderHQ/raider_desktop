import { create } from 'zustand'
import toast from 'react-hot-toast'
import i18n from 'i18next'
import useProjectStore from '@foundation/Stores/projectStore'
import useRubyStore from '@foundation/Stores/rubyStore'
import { loadRunSettings, workersFor } from '@foundation/run/runSettings'
import { notifyRunFinished } from '@foundation/run/notifyRunFinished'
import { reduceRun, viewFromActiveRun, type RunView } from '@foundation/run/runModel'
import type { RunEvent, RunScope } from '@shared/types/runEvents'

/** Where a run was started from, so the panel can link back to it. */
export interface RunOrigin {
  route: string
  label: string
}

interface RunStore {
  run: RunView | null
  origin: RunOrigin | null
  isActive: boolean
  ingest: (e: RunEvent) => void
  restore: () => Promise<void>
  start: (scope: RunScope, origin: RunOrigin) => Promise<'started' | 'busy' | 'error'>
  cancel: () => Promise<void>
}

// The app uses a hash router, so setting the hash navigates without needing router access here
const navigateTo = (to: string): void => {
  window.location.hash = to
}

const isActiveRun = (run: RunView | null): boolean => run !== null && run.finished === null

export const useRunStore = create<RunStore>(
  (set, get): RunStore => ({
    run: null,
    origin: null,
    isActive: false,
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
    start: async (scope: RunScope, origin: RunOrigin): Promise<'started' | 'busy' | 'error'> => {
      const rubyCommand = useRubyStore.getState().rubyCommand
      const projectPath = useProjectStore.getState().projectPath
      if (!rubyCommand || !projectPath) {
        toast.error(i18n.t('recorder.noRuby'))
        return 'error'
      }
      try {
        const settings = loadRunSettings(projectPath)
        const defaults = await window.api.getRunDefaults()
        const result = await window.api.startRun({
          scope,
          workers: workersFor(settings, defaults, scope),
          rubyCommand,
          quarantinedFails: settings.quarantinedFails
        })
        if ('runId' in result) {
          set({ origin })
          return 'started'
        }
        if (result.error === 'busy') {
          toast.error(i18n.t('run.busy'))
          return 'busy'
        }
        toast.error(result.error)
        return 'error'
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error))
        return 'error'
      }
    },
    cancel: async (): Promise<void> => {
      const run = get().run
      if (!run || run.finished) return
      try {
        await window.api.cancelRun(run.runId)
      } catch (error) {
        console.error('Cancelling the run failed:', error)
      }
    }
  })
)

/** Feeds run events into the store once, then restores a run already in progress. */
export function subscribeRunEvents(): () => void {
  const unsubscribe = window.api.onRunEvent((e) => useRunStore.getState().ingest(e))
  void useRunStore.getState().restore()
  return unsubscribe
}
