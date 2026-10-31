import { create } from 'zustand'
import useProjectStore from '@foundation/Stores/projectStore'
import { reduceRun, viewFromActiveRun, type RunView } from '@foundation/run/runModel'
import type { RunEvent } from '@shared/types/runEvents'

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
    },
    restore: async (): Promise<void> => {
      try {
        const active = await window.api.getActiveRun()
        if (!active) return
        // The snapshot already holds any events that arrived while this was in flight
        const run = viewFromActiveRun(active)
        if (run) set({ run, isActive: isActiveRun(run) })
      } catch (error) {
        console.error('Restoring the active run failed:', error)
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
