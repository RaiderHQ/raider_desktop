import type { AssertKind, ElementTarget, Step } from '@shared/types/step'

// Page-level checks read the browser, not an element
const PAGE_CHECKS: AssertKind[] = ['titleEquals', 'urlIncludes']

/** Builds an assert Step from the assertion menu (plus the modal's text, when it asks for one). */
export function buildAssertionStep(
  kind: AssertKind,
  element: ElementTarget | undefined,
  expected?: string
): Step {
  return {
    id: crypto.randomUUID(),
    kind: 'assert',
    check: kind,
    ...(element && !PAGE_CHECKS.includes(kind) ? { element } : {}),
    ...(expected !== undefined ? { expected } : {})
  }
}

const MODAL_TYPES: Partial<Record<AssertKind, string>> = {
  textEquals: 'text',
  textIncludes: 'text-includes',
  valueEquals: 'value',
  titleEquals: 'page-title',
  urlIncludes: 'page-url'
}

/** The AssertionTextModal copy (title, message, label) for an assertion that needs text. */
export const assertionModalType = (kind: AssertKind): string => MODAL_TYPES[kind] ?? 'text'
