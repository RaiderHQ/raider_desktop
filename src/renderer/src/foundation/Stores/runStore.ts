import { create } from 'zustand'
import toast from 'react-hot-toast'
import i18n from 'i18next'
import useProjectStore from '@foundation/Stores/projectStore'
import useRubyStore from '@foundation/Stores/rubyStore'
import { loadRunSettings, loginStateFor, workersFor } from '@foundation/run/runSettings'
import { notifyRunFinished } from '@foundation/run/notifyRunFinished'
import { reduceRun, viewFromActiveRun, type RunView } from '@foundation/run/runModel'
import type { RunEvent, RunScope } from '@shared/types/runEvents'

/** Where a run was started from, so the panel can link back to it. */
export interface RunOrigin {
  route: string
  label: string
}

/** A mobile run that didn't start because the project isn't ready, kept so it can be retried */
export interface MobileNotReady {
  reason: 'appium' | 'app'
  detail: string
  scope: RunScope
  origin: RunOrigin
  projectPath: string
}

interface RunStore {
  run: RunView | null
  origin: RunOrigin | null
  isActive: boolean
  freshLoginNext: boolean
  notReady: MobileNotReady | null
  /** Asks Overview to show the device settings and focus the app file */
  deviceFocusRequested: boolean
  /** A mobile readiness check is in flight; a run is about to start or not */
  checking: boolean
  setFreshLoginNext: (v: boolean) => void
  ingest: (e: RunEvent) => void
  restore: () => Promise<void>
  start: (
    scope: RunScope,
    origin: RunOrigin,
    opts?: { skipMobileCheck?: boolean }
  ) => Promise<'started' | 'busy' | 'error'>
  cancel: () => Promise<void>
  dismissNotReady: () => void
  requestDeviceFocus: () => void
  clearDeviceFocus: () => void
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
    freshLoginNext: false,
    notReady: null,
    deviceFocusRequested: false,
    checking: false,
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
    start: async (
      scope: RunScope,
      origin: RunOrigin,
      opts: { skipMobileCheck?: boolean } = {}
    ): Promise<'started' | 'busy' | 'error'> => {
      // A second click while checking would only check again, then hit a busy run
      if (get().checking) return 'busy'
      set({ notReady: null })
      const rubyCommand = useRubyStore.getState().rubyCommand
      const { projectPath, layout } = useProjectStore.getState()
      if (!rubyCommand || !projectPath) {
        toast.error(i18n.t('recorder.noRuby'))
        return 'error'
      }
      const mobile = layout?.automation === 'appium'
      // Until the layout loads it could be mobile; main answers ok for a web project
      if ((mobile || layout === null) && !opts.skipMobileCheck) {
        let ready: Awaited<ReturnType<typeof window.api.checkMobileReady>> | null = null
        set({ checking: true })
        try {
          ready = await window.api.checkMobileReady(projectPath)
        } catch (error) {
          console.error('Checking the mobile project failed:', error)
        } finally {
          set({ checking: false })
        }
        // The answer is about a project that's no longer open
        if (useProjectStore.getState().projectPath !== projectPath) return 'error'
        if (!ready || 'error' in ready) {
          toast.error(i18n.t('run.mobile.checkFailed'))
          return 'error'
        }
        if (!ready.ok) {
          set({
            notReady: { reason: ready.reason, detail: ready.detail, scope, origin, projectPath }
          })
          return 'error'
        }
      }
      // The layout may have loaded during the check
      const known = useProjectStore.getState().layout
      const isMobile = mobile || known?.automation === 'appium'
      // Appium drives one device, and a project not known to be web could be mobile: serial
      const serial = isMobile || known === null
      try {
        const settings = loadRunSettings(projectPath)
        const defaults = await window.api.getRunDefaults()
        // Saved browser logins mean nothing to an Appium run
        const loginState = isMobile ? undefined : loginStateFor(settings, get().freshLoginNext)
        const result = await window.api.startRun({
          scope,
          workers: serial ? undefined : workersFor(settings, defaults, scope),
          rubyCommand,
          quarantinedFails: settings.quarantinedFails,
          ...(loginState ? { loginState } : {})
        })
        if ('runId' in result) {
          set({ origin, freshLoginNext: false })
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
    },
    dismissNotReady: (): void => set({ notReady: null }),
    requestDeviceFocus: (): void => set({ deviceFocusRequested: true }),
    clearDeviceFocus: (): void => set({ deviceFocusRequested: false })
  })
)

// Why a run didn't start belongs to one project, so it never outlives a switch
useProjectStore.subscribe(
  (state) => state.projectPath,
  () => useRunStore.setState({ notReady: null, deviceFocusRequested: false })
)

/** Feeds run events into the store once, then restores a run already in progress. */
export function subscribeRunEvents(): () => void {
  const unsubscribe = window.api.onRunEvent((e) => useRunStore.getState().ingest(e))
  void useRunStore.getState().restore()
  return unsubscribe
}
