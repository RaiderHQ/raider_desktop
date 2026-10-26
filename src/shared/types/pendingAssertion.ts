import type { AssertKind, ElementTarget, Step } from './step'

/**
 * Sent by the assertion context menu: a ready Step, or an assertion that still
 * needs its expected text from the user (text, value, title and URL checks).
 */
export interface PendingAssertion {
  pendingAssertion: AssertKind
  element?: ElementTarget
  text: string // prefill for the expected-text prompt
}

export type AssertionMessage = Step | PendingAssertion

export const isPendingAssertion = (m: AssertionMessage): m is PendingAssertion =>
  'pendingAssertion' in m
