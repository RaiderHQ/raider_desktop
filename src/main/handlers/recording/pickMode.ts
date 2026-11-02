import { webContents, type WebContents } from 'electron'
import { appState } from '../appState'
import { toElementTarget, type LabelHints } from './recorderEvent'
import type { PickResult } from '../../../shared/types/pick'

// Stops watching the guest for navigation; set while pick mode is on
let unwatchGuest: (() => void) | null = null
// Bumped whenever pick mode ends: a pick still waiting for the page to settle never starts
let pickGeneration = 0

/** How long the page must have stopped loading before picking starts */
export const PICK_SETTLE_MS = 300
/** Picking starts after this long even if the page is still loading */
const PICK_SETTLE_TIMEOUT_MS = 10_000

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
  pickGeneration++
  if (!appState.pickMode) return
  appState.pickMode = false
  appState.pickModeEndedAt = Date.now()
  unwatchGuest?.()
  unwatchGuest = null
  guest()?.send('recorder-pick-mode', false)
  if (result) sendResult(result)
}

type NavigationDetails = { isMainFrame?: boolean; isSameDocument?: boolean }

const leavesPage = (details: NavigationDetails): boolean =>
  !!details?.isMainFrame && !details.isSameDocument

/**
 * Resolves once the guest has stopped loading for PICK_SETTLE_MS, so a navigation the last
 * replayed click started lands before picking does; after PICK_SETTLE_TIMEOUT_MS regardless.
 */
function settled(wc: WebContents): Promise<void> {
  return new Promise((resolve) => {
    let quiet: ReturnType<typeof setTimeout> | undefined
    const done = (): void => {
      clearTimeout(quiet)
      clearTimeout(deadline)
      wc.removeListener('did-start-navigation', onNavigate)
      wc.removeListener('did-start-loading', onStart)
      wc.removeListener('did-stop-loading', check)
      wc.removeListener('destroyed', done)
      resolve()
    }
    const check = (): void => {
      clearTimeout(quiet)
      if (wc.isDestroyed() || !wc.isLoading()) quiet = setTimeout(done, PICK_SETTLE_MS)
    }
    const onStart = (): void => clearTimeout(quiet)
    const onNavigate = (details: NavigationDetails): void => {
      if (leavesPage(details)) clearTimeout(quiet)
    }
    const deadline = setTimeout(done, PICK_SETTLE_TIMEOUT_MS)
    wc.on('did-start-navigation', onNavigate)
    wc.on('did-start-loading', onStart)
    wc.on('did-stop-loading', check)
    wc.on('destroyed', done)
    check()
  })
}

// Main is the one source of truth for picking. A new page loads the preload with picking
// off, so a navigation while picking ends it here too, as a cancel that says the page changed;
// the app tells the user to try again. Pick mode is never carried over to the new page.
function watchGuest(wc: WebContents): () => void {
  const onNavigate = (details: NavigationDetails): void => {
    if (leavesPage(details)) endPickMode({ cancelled: true, reason: 'navigated' })
  }
  const onDestroyed = (): void => endPickMode({ cancelled: true })
  wc.on('did-start-navigation', onNavigate)
  wc.on('destroyed', onDestroyed)
  return (): void => {
    wc.removeListener('did-start-navigation', onNavigate)
    wc.removeListener('destroyed', onDestroyed)
  }
}

/**
 * Turns pick mode off at once, or on once the page has settled (see `settled`). Fails when
 * there is no recorder page, or when picking was ended or the page went away meanwhile.
 */
export async function setPickMode(on: boolean): Promise<{ success: boolean }> {
  if (!on) {
    endPickMode()
    return { success: true }
  }
  // Picking covers the top frame only: the recorder preload doesn't run in iframes, so a click
  // inside one picks nothing. The app doesn't offer picking for steps inside frames.
  const wc = guest()
  if (!wc) return { success: false }
  if (!appState.pickMode) {
    const generation = pickGeneration
    await settled(wc)
    if (generation !== pickGeneration || guest()?.id !== wc.id) return { success: false }
    if (!appState.pickMode) {
      appState.pickMode = true
      unwatchGuest = watchGuest(wc)
    }
  }
  wc.send('recorder-pick-mode', true)
  return { success: true }
}

/** Only the app window may switch pick mode; the guest page never can */
export async function handleSetPickMode(
  senderId: number,
  on: unknown
): Promise<{ success: boolean }> {
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
