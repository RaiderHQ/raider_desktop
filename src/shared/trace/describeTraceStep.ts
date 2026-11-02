import { ROLE_WORDS } from '../describeStep'
import type { RaiderTraceStep, TraceLocator } from '../types/raiderTrace'

/** An i18n key plus its interpolation values; the renderer translates it. */
export interface TraceText {
  key: string
  values: Record<string, string>
}

const S = 'traceViewer.step'
const E = 'traceViewer.element'

// Steps that name an element; the key is the one the action maps to.
const ELEMENT_ACTIONS: Record<string, string> = {
  click: 'click',
  clear: 'clear',
  submit: 'submit',
  hover: 'hover',
  drag_and_drop: 'dragAndDrop',
  scroll_into_view: 'scrollIntoView',
  text: 'readText',
  attribute: 'readAttribute',
  'displayed?': 'checkVisible',
  'enabled?': 'checkEnabled',
  'selected?': 'checkSelected',
  find_element: 'findElement'
}

// Steps that never name an element.
const PLAIN_ACTIONS: Record<string, string> = {
  find_elements: 'findElements',
  eventually: 'eventually'
}

function elementText(step: RaiderTraceStep): TraceText {
  const label = step.element?.label
  if (!label) return { key: `${E}.unnamed`, values: {} }
  const role = step.element?.role
  const roleWord = role !== undefined && Object.hasOwn(ROLE_WORDS, role) ? ROLE_WORDS[role] : null
  return roleWord
    ? { key: `${E}.withRole`, values: { label, role: roleWord } }
    : { key: `${E}.named`, values: { label } }
}

// Origin and path only: a query string, fragment or credentials may carry secrets.
export function plainUrl(url: string | null): string {
  if (!url) return ''
  try {
    const u = new URL(url)
    u.search = ''
    u.hash = ''
    u.username = ''
    u.password = ''
    return u.href
  } catch {
    // Unparseable: still drop the query, fragment and any user:pass@ part.
    return url.split(/[?#]/)[0].replace(/^((?:[a-z][\w+.-]*:)?\/\/)?[^/]*@/i, '$1')
  }
}

/**
 * A step in plain words. Never includes a selector, a locator, an error, or the
 * value of a secret step.
 */
export function describeTraceStep(step: RaiderTraceStep): TraceText & { element?: TraceText } {
  if (step.kind === 'failure') return { key: `${S}.failure`, values: {} }
  const { action } = step
  if (action === 'cucumber_step') {
    if (step.secret) return { key: `${S}.cucumberSecret`, values: {} }
    return { key: `${S}.cucumber`, values: { name: step.name ?? '' } }
  }
  if (action === 'navigate') return { key: `${S}.navigate`, values: { url: plainUrl(step.url) } }

  const plain = Object.hasOwn(PLAIN_ACTIONS, action) ? PLAIN_ACTIONS[action] : undefined
  if (plain) return { key: `${S}.${plain}`, values: {} }

  const element = elementText(step)
  const text = step.secret ? null : step.value
  if (action === 'send_keys') {
    if (step.secret) return { key: `${S}.typeSecret`, values: {}, element }
    return text
      ? { key: `${S}.typeText`, values: { text }, element }
      : { key: `${S}.typeEmpty`, values: {}, element }
  }
  if (action === 'select_by') {
    return text
      ? { key: `${S}.selectOption`, values: { text }, element }
      : { key: `${S}.selectSecret`, values: {}, element }
  }
  const named = Object.hasOwn(ELEMENT_ACTIONS, action) ? ELEMENT_ACTIONS[action] : undefined
  if (named) return { key: `${S}.${named}`, values: {}, element }
  return { key: `${S}.other`, values: {} }
}

const STRATEGIES = new Set([
  'id',
  'css',
  'xpath',
  'name',
  'link_text',
  'partial_link_text',
  'class_name',
  'tag_name'
])

/** How the element was found, in plain words; never carries the selector. */
export function traceFoundBy(locator: TraceLocator | null): TraceText | null {
  if (!locator) return null
  const known = STRATEGIES.has(locator.strategy)
  return { key: `traceViewer.foundBy.${known ? locator.strategy : 'other'}`, values: {} }
}
