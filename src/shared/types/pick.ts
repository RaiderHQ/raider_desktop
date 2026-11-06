import type { ElementTarget } from './step'

/** What the recorder preload sends for the element the user picked */
export interface PickCandidate {
  selector: string
  strategy: string
  locator?: unknown
  innerText?: string
  ariaLabel?: string
  placeholder?: string
  /** For the assertion menu; '' for a password field */
  elementValue?: string
  inputType?: string
  pageTitle?: string
  pageUrl?: string
}

/**
 * What the app gets when picking ends: the element, or a cancel (Esc, recorder closed, or
 * `navigated`: the page changed while picking)
 */
export type PickResult = { element: ElementTarget } | { cancelled: true; reason?: 'navigated' }

/** After picking ends, clicks are neither passed to the page nor recorded for this long (a double-click) */
export const PICK_GRACE_MS = 500
