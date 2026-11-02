import React, { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import SavedTraceViewer from '@components/SavedTraceViewer'
import { useTraceStore } from '@foundation/Stores/traceStore'
import { useTraceOpener } from '@foundation/trace/useTraceOpener'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

const firstStop = (root: HTMLElement): HTMLElement =>
  Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).find((el) => !el.closest('[inert]')) ??
  root

const hasFiles = (event: DragEvent): boolean =>
  Array.from(event.dataTransfer?.types ?? []).includes('Files')

// The app behind the overlay: the siblings before it. The toasts come after,
// so an error is still announced while the viewer is open.
const hideBehind = (root: HTMLElement): (() => void) => {
  const hidden: { el: Element; ariaHidden: string | null; inert: boolean }[] = []
  for (let el = root.previousElementSibling; el; el = el.previousElementSibling) {
    hidden.push({ el, ariaHidden: el.getAttribute('aria-hidden'), inert: el.hasAttribute('inert') })
    el.setAttribute('inert', '')
    el.setAttribute('aria-hidden', 'true')
  }
  return (): void => {
    for (const { el, ariaHidden, inert } of hidden) {
      if (!inert) el.removeAttribute('inert')
      if (ariaHidden === null) el.removeAttribute('aria-hidden')
      else el.setAttribute('aria-hidden', ariaHidden)
    }
  }
}

/**
 * The saved trace viewer, over the whole window. Mounted once, so traces open
 * from a result card, File → Open trace or a file dropped on the window, with
 * or without a project.
 */
const TraceViewerOverlay: React.FC = () => {
  const { t } = useTranslation()
  const current = useTraceStore((state) => state.current)
  const close = useTraceStore((state) => state.close)
  const { handleResult, openDroppedTrace } = useTraceOpener()
  const rootRef = useRef<HTMLDivElement>(null)
  const isOpen = current !== null
  const traceId = current?.traceId ?? null

  // File → Open trace sends its result here.
  useEffect(() => window.api.onTraceOpened((result) => handleResult(result)), [handleResult])

  // A dropped file opens through preload only; anything but one .zip is refused
  // here, and said so only while the viewer is open (a stray drop stays silent).
  useEffect(() => {
    const onDragOver = (event: DragEvent): void => {
      if (hasFiles(event)) event.preventDefault()
    }
    const onDrop = (event: DragEvent): void => {
      if (!hasFiles(event)) return
      // Never let the window navigate to a dropped file.
      event.preventDefault()
      const viewing = useTraceStore.getState().current !== null
      const files = event.dataTransfer?.files
      if (!files || files.length !== 1) {
        if (viewing && files && files.length > 1) toast.error(t('traceViewer.error.dropOne'))
        return
      }
      const file = files[0]
      if (!file.name.toLowerCase().endsWith('.zip')) {
        if (viewing) toast.error(t('traceViewer.error.notTrace'))
        return
      }
      void openDroppedTrace(file)
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return (): void => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [openDroppedTrace, t])

  // Main holds an open trace until it is closed, so leaving closes it.
  useEffect(() => (): void => useTraceStore.getState().close(), [])

  // While open: the app behind is inert, Escape closes, Tab stays inside, and
  // focus goes back to the opener after.
  useEffect(() => {
    if (!isOpen) return
    const root = rootRef.current
    if (!root) return
    const showBehind = hideBehind(root)
    const opener =
      useTraceStore.getState().opener ??
      (document.activeElement instanceof HTMLElement ? document.activeElement : null)
    const stops = (): HTMLElement[] =>
      Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => !el.closest('[inert]')
      )

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        useTraceStore.getState().close()
        return
      }
      if (event.key !== 'Tab') return
      const list = stops()
      if (list.length === 0) return
      const first = list[0]
      const last = list[list.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || !root.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (active === last || !root.contains(active))) {
        event.preventDefault()
        first.focus()
      }
    }
    const onFocusIn = (event: FocusEvent): void => {
      if (event.target instanceof Node && !root.contains(event.target)) firstStop(root).focus()
    }
    // A click into the snapshot frame moves focus into it, where keys never reach
    // the app (the window blurs); take focus back so Escape keeps working.
    let refocus: ReturnType<typeof setTimeout> | undefined
    const onBlur = (): void => {
      const active = document.activeElement
      if (active instanceof HTMLIFrameElement && root.contains(active)) {
        clearTimeout(refocus)
        refocus = setTimeout(() => root.focus(), 0)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('focusin', onFocusIn)
    window.addEventListener('blur', onBlur)
    return (): void => {
      clearTimeout(refocus)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('focusin', onFocusIn)
      window.removeEventListener('blur', onBlur)
      // Before focusing: an inert opener can't take focus.
      showBehind()
      if (opener?.isConnected) opener.focus()
    }
  }, [isOpen])

  // On open, and when another trace replaces the shown one, start at Close trace.
  useEffect(() => {
    if (traceId && rootRef.current) firstStop(rootRef.current).focus()
  }, [traceId])

  if (!current) return null

  return (
    <div
      ref={rootRef}
      data-testid="trace-viewer"
      role="dialog"
      aria-modal="true"
      aria-label={t('traceViewer.dialog', { name: current.index.test.fullName })}
      tabIndex={-1}
      className="fixed inset-0 z-40 bg-white"
    >
      <SavedTraceViewer
        key={current.traceId}
        traceId={current.traceId}
        index={current.index}
        onClose={close}
      />
    </div>
  )
}

export default TraceViewerOverlay
