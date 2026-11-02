import { webContents, type WebContents } from 'electron'
import { appState } from '../appState'
import { toElementTarget, type LabelHints } from './recorderEvent'
import type { PickResult } from '../../../shared/types/pick'

// Stops watching the guest for navigation; set while pick mode is on
let unwatchGuest: (() => void) | null = null

function guest(): WebContents | null {
  if (appState.recorderWebContentsId === null) return null
  const wc = webContents.fromId(appState.recorderWebContentsId)
  return wc && !wc.isDestroyed() ? wc : null
}

function sendResult(result: PickResult): void {
  appState.mainWindow?.webContents.send('recorder-picked', result)
}

/** Ends pick mode in main and in the guest; with a result, tells the app why it ended */
function endPickMode(result?: PickResult): void {
  if (!appState.pickMode) return
  appState.pickMode = false
  unwatchGuest?.()
  unwatchGuest = null
  guest()?.send('recorder-pick-mode', false)
  if (result) sendResult(result)
}

// A new page loads the preload with picking off, so a navigation ends pick mode as a cancel
function watchGuest(wc: WebContents): () => void {
  const onNavigate = (details: { isMainFrame?: boolean; isSameDocument?: boolean }): void => {
    if (details?.isMainFrame && !details.isSameDocument) endPickMode({ cancelled: true })
  }
  const onDestroyed = (): void => endPickMode({ cancelled: true })
  wc.on('did-start-navigation', onNavigate)
  wc.on('destroyed', onDestroyed)
  return (): void => {
    wc.removeListener('did-start-navigation', onNavigate)
    wc.removeListener('destroyed', onDestroyed)
  }
}

export function setPickMode(on: boolean): { success: boolean } {
  if (!on) {
    endPickMode()
    return { success: true }
  }
  const wc = guest()
  if (!wc) return { success: false }
  if (!appState.pickMode) {
    appState.pickMode = true
    unwatchGuest = watchGuest(wc)
  }
  wc.send('recorder-pick-mode', true)
  return { success: true }
}

/** Only the app window may switch pick mode; the guest page never can */
export function handleSetPickMode(senderId: number, on: unknown): { success: boolean } {
  if (senderId !== appState.mainWindow?.webContents.id) return { success: false }
  return setPickMode(on === true)
}

// The guest page is untrusted: accept its messages only while picking, and only from the recorder
const fromPickingGuest = (senderId: number): boolean =>
  appState.pickMode && senderId === appState.recorderWebContentsId

const text = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

export function handleRecorderPicked(senderId: number, data: unknown): void {
  if (!fromPickingGuest(senderId) || typeof data !== 'object' || data === null) return
  const d = data as Record<string, unknown>
  const hints: LabelHints = {
    innerText: text(d.innerText),
    ariaLabel: text(d.ariaLabel),
    placeholder: text(d.placeholder),
    locator: d.locator
  }
  const element = toElementTarget(text(d.strategy) ?? '', text(d.selector) ?? '', hints)
  // Nothing usable to find it by: the guest has already stopped, so keep it picking
  if (!element) {
    guest()?.send('recorder-pick-mode', true)
    return
  }
  endPickMode({ element })
}

export function handleRecorderPickCancelled(senderId: number): void {
  if (!fromPickingGuest(senderId)) return
  endPickMode({ cancelled: true })
}

/** Ends pick mode as a cancel, e.g. when recording stops; call it while the guest is still known */
export function cancelPickMode(): void {
  endPickMode({ cancelled: true })
}
