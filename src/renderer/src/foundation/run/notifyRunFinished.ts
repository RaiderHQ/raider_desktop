import i18n from 'i18next'
import type { RunView } from '@foundation/run/runModel'
import type { RunOrigin } from '@foundation/Stores/runStore'

const bodyFor = (finished: NonNullable<RunView['finished']>): string => {
  if (finished.status === 'errored') return i18n.t('run.result.errored')
  if (finished.status === 'cancelled') return i18n.t('run.result.cancelled')
  const { passed, failed } = finished.counts
  return i18n.t('run.notifyBody', { passed, failed })
}

/** Tells the user a run is over when the app isn't in front. Clicking it returns to where the run began. */
export function notifyRunFinished(
  run: RunView,
  origin: RunOrigin | null,
  navigate: (to: string) => void
): void {
  if (!run.finished || document.hasFocus()) return
  const notification = new Notification(i18n.t('run.notifyTitle'), { body: bodyFor(run.finished) })
  notification.onclick = (): void => {
    window.focus()
    navigate(origin?.route ?? '/overview')
  }
}
