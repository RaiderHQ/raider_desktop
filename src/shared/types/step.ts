export type Strategy = 'id' | 'css' | 'xpath'

export interface ElementTarget {
  strategy: Strategy
  value: string
  label?: string // human name, e.g. 'Login button' (from innerText/aria-label)
  ref?: { page: string; name: string }
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
  // comes from a RAIDER_SECRET_<n> environment variable when the test runs
  | { id: string; kind: 'type'; element: ElementTarget; text: string; secret?: true }
  | { id: string; kind: 'pressKey'; element: ElementTarget; key: string }
  | { id: string; kind: 'wait'; element: ElementTarget; until: 'visible' | 'hidden' | 'enabled' }
  | { id: string; kind: 'assert'; check: AssertKind; element?: ElementTarget; expected?: string }
  | { id: string; kind: 'switchFrame'; element?: ElementTarget }
  | { id: string; kind: 'custom'; code: string }

const STRATEGIES = ['id', 'css', 'xpath']
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

function isElementTarget(v: unknown): v is ElementTarget {
  if (!isObj(v)) return false
  if (!isStr(v.strategy) || !STRATEGIES.includes(v.strategy) || !isStr(v.value)) return false
  if (v.label !== undefined && !isStr(v.label)) return false
  if (v.ref !== undefined && !(isObj(v.ref) && isStr(v.ref.page) && isStr(v.ref.name))) return false
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
