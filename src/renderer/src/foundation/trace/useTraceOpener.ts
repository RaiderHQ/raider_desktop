import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import type {
  ResultTraceSource,
  TraceOpenError,
  TraceOpenResult
} from '@shared/types/raiderTrace'
import { useTraceStore } from '../Stores/traceStore'

const ERRORS: TraceOpenError[] = ['notFound', 'tooLarge', 'unsafe', 'notTrace', 'newerVersion', 'damaged']

/**
 * Opens saved traces into the viewer. Results from the cards, the menu and
 * drops all go through handleResult; a failure becomes one plain message.
 */
export function useTraceOpener(): {
  openTrace: (source: ResultTraceSource) => Promise<void>
  openDroppedTrace: (file: File) => Promise<void>
  handleResult: (result: TraceOpenResult, opener?: HTMLElement | null) => void
  opening: boolean
} {
  const { t } = useTranslation()
  const show = useTraceStore((state) => state.show)
  const opening = useTraceStore((state) => state.opening)

  const handleResult = useCallback(
    (result: TraceOpenResult, opener?: HTMLElement | null): void => {
      if (result.ok) {
        show(result.traceId, result.index, opener)
        return
      }
      const error = ERRORS.includes(result.error) ? result.error : 'damaged'
      toast.error(t(`traceViewer.error.${error}`))
    },
    [show, t]
  )

  const run = useCallback(
    async (open: () => Promise<TraceOpenResult>): Promise<void> => {
      const { opening: busy, setOpening } = useTraceStore.getState()
      if (busy) return
      // Taken now: the button is disabled while opening, which may drop its focus.
      const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
      setOpening(true)
      let result: TraceOpenResult
      try {
        result = await open()
      } catch {
        result = { ok: false, error: 'damaged' }
      } finally {
        setOpening(false)
      }
      handleResult(result, opener)
    },
    [handleResult]
  )

  const openTrace = useCallback(
    (source: ResultTraceSource) => run(() => window.api.openTrace(source)),
    [run]
  )
  const openDroppedTrace = useCallback(
    (file: File) => run(() => window.api.openDroppedTrace(file)),
    [run]
  )

  return { openTrace, openDroppedTrace, handleResult, opening }
}
