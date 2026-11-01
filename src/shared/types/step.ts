export type Strategy = 'id' | 'css' | 'xpath'

/** A semantic way to find an element, richer than the strategy/value pair. */
export type Locator =
  // nameFrom: where the name came from; tag: the element's lowercase tagName (picks the Watir method)
  | {
      by: 'role'
      role: string
      name: string
      nameFrom?: 'content' | 'aria-label' | 'other'
      tag?: string
    }
  | { by: 'label'; text: string }
  | { by: 'testId'; attribute: string; value: string }
  | { by: 'text'; text: string }
  | { by: 'id'; value: string }
  | { by: 'css'; value: string; positional: boolean }
  | { by: 'xpath'; value: string }

export interface ElementTarget {
  strategy: Strategy
  value: string
  label?: string // human name, e.g. 'Login button' (from innerText/aria-label)
  ref?: { page: string; name: string }
  locator?: Locator // semantic locator the recorder captured; strategy/value stay as the fallback
}

export type AssertKind =
  | 'displayed'
  | 'notDisplayed'
  | 'enabled'
  | 'checked'
  | 'textEquals'
  | 'textIncludes'
  | 'valueEquals'
  | 'titleEquals'
  | 'urlIncludes'

export type Step =
  | { id: string; kind: 'navigate'; url: string }
  | { id: string; kind: 'click'; element: ElementTarget }
  // A secret step (a password field) never holds its value: text is '' and the value
  // comes from the environment variable secretName (RAIDER_SECRET_<n> unless renamed)
  | {
      id: string
      kind: 'type'
      element: ElementTarget
      text: string
      secret?: true
      secretName?: string
    }
  | { id: string; kind: 'pressKey'; element: ElementTarget; key: string }
  | { id: string; kind: 'wait'; element: ElementTarget; until: 'visible' | 'hidden' | 'enabled' }
  | { id: string; kind: 'assert'; check: AssertKind; element?: ElementTarget; expected?: string }
  | { id: string; kind: 'switchFrame'; element?: ElementTarget }
  | { id: string; kind: 'custom'; code: string }

const STRATEGIES = ['id', 'css', 'xpath']
/**
 * The variables a secret step may read: RAIDER_SECRET_ then capitals, digits and _.
 * Only these, so a shared test can't read a real credential (GITHUB_TOKEN, or the
 * Hideout client's RAIDER_TOKEN) and type it into a page.
 */
export const SECRET_NAME = /^RAIDER_SECRET_[A-Z0-9_]+$/
const WAIT_UNTIL = ['visible', 'hidden', 'enabled']
const ASSERT_KINDS: AssertKind[] = [
  'displayed',
  'notDisplayed',
  'enabled',
  'checked',
  'textEquals',
  'textIncludes',
  'valueEquals',
  'titleEquals',
  'urlIncludes'
]

const NEEDS_ELEMENT: AssertKind[] = [
  'displayed',
  'notDisplayed',
  'enabled',
  'checked',
  'textEquals',
  'textIncludes',
  'valueEquals'
]
const NEEDS_EXPECTED: AssertKind[] = [
  'textEquals',
  'textIncludes',
  'valueEquals',
  'titleEquals',
  'urlIncludes'
]

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const isStr = (v: unknown): v is string => typeof v === 'string'

const isNonEmpty = (v: unknown): v is string => isStr(v) && v !== ''

const NAME_SOURCES = ['content', 'aria-label', 'other']

export function isLocator(v: unknown): v is Locator {
  if (!isObj(v)) return false
  switch (v.by) {
    case 'role':
      return (
        isNonEmpty(v.role) &&
        isNonEmpty(v.name) &&
        (v.nameFrom === undefined || NAME_SOURCES.includes(v.nameFrom as string)) &&
        (v.tag === undefined || isNonEmpty(v.tag))
      )
    case 'label':
    case 'text':
      return isNonEmpty(v.text)
    case 'testId':
      return isNonEmpty(v.attribute) && isNonEmpty(v.value)
    case 'id':
    case 'xpath':
      return isNonEmpty(v.value)
    case 'css':
      return isNonEmpty(v.value) && typeof v.positional === 'boolean'
    default:
      return false
  }
}

/** True for locators that break when the page layout shifts: positional css and xpath. */
export function isWeakLocator(l: Locator | undefined): boolean {
  return l !== undefined && (l.by === 'xpath' || (l.by === 'css' && l.positional))
}

function isElementTarget(v: unknown): v is ElementTarget {
  if (!isObj(v)) return false
  if (!isStr(v.strategy) || !STRATEGIES.includes(v.strategy) || !isStr(v.value)) return false
  if (v.label !== undefined && !isStr(v.label)) return false
  if (v.ref !== undefined && !(isObj(v.ref) && isStr(v.ref.page) && isStr(v.ref.name))) return false
  if (v.locator !== undefined && !isLocator(v.locator)) return false
  return true
}

const isOptionalElement = (v: unknown): boolean => v === undefined || isElementTarget(v)

export function isStep(value: unknown): value is Step {
  if (!isObj(value) || !isStr(value.id)) return false
  switch (value.kind) {
    case 'navigate':
      return isStr(value.url)
    case 'click':
      return isElementTarget(value.element)
    case 'type':
      if (value.secret !== undefined && !(value.secret === true && value.text === '')) return false
      if (
        value.secretName !== undefined &&
        !(value.secret === true && isStr(value.secretName) && SECRET_NAME.test(value.secretName))
      )
        return false
      return isElementTarget(value.element) && isStr(value.text)
    case 'pressKey':
      return isElementTarget(value.element) && isStr(value.key)
    case 'wait':
      return (
        isElementTarget(value.element) && isStr(value.until) && WAIT_UNTIL.includes(value.until)
      )
    case 'assert': {
      if (!isStr(value.check) || !(ASSERT_KINDS as string[]).includes(value.check)) return false
      const check = value.check as AssertKind
      if (!isOptionalElement(value.element)) return false
      if (value.expected !== undefined && !isStr(value.expected)) return false
      if (NEEDS_ELEMENT.includes(check) && value.element === undefined) return false
      if (NEEDS_EXPECTED.includes(check) && value.expected === undefined) return false
      return true
    }
    case 'switchFrame':
      return isOptionalElement(value.element)
    case 'custom':
      return isStr(value.code)
    default:
      return false
  }
}
