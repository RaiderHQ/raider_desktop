import { randomUUID } from 'node:crypto'
import { DEFAULT_TEST_ID_ATTRIBUTE } from '../../shared/testIdAttribute'
import { isStep } from '../../shared/types/step'
import { withSecretNames } from '../../shared/secretSteps'
import type { AssertKind, ElementTarget, Step } from '../../shared/types/step'
import type { Test } from '../../shared/types/test'
import { labelXPath, roleXPath, testIdCss, textXPath } from '../../shared/locatorSelectors'

/**
 * One-time converter from recorded Ruby strings to structured Steps.
 * Recognises the forms produced by the old recorder (frameworkTemplates,
 * xpathConverter), the patterns of the old commandParser/xpathParser, and the
 * ruby_raider 4.0 lines steps.ts renders today (semantic locators, block matchers).
 * Anything it cannot map losslessly becomes a `custom` step.
 */

/** Kept as an alias: a migrated test is a plain Test now that steps are Step[]. */
export type MigratedTest = Test

// A Ruby string literal — capture groups: "…", '…'
const S = String.raw`(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)')`
// find_element(<anything>) — capture group: the locator argument, parsed by `target`. Lazy, so
// a trailing comment or the matcher after the block never ends up inside the argument.
const FIND = String.raw`@?driver\.find_element\((.+?)\)`
const TAIL = String.raw`(?:\s+#.*)?\s*$`
const DRIVER = String.raw`@?driver`

// Ruby single-quoted strings only treat \\ and \' as escapes
const unescapeSingle = (s: string): string => s.replace(/\\([\\'])/g, '$1')
const unescape = (s: string): string => s.replace(/\\(["\\])/g, '$1')

/** The string literal matched by S whose two groups start at `at`. */
const str = (m: RegExpMatchArray, at: number): string =>
  m[at] !== undefined ? unescape(m[at]) : unescapeSingle(m[at + 1] ?? '')

const KEYS: Record<string, string> = {
  enter: 'Enter',
  return: 'Enter',
  tab: 'Tab',
  escape: 'Escape',
  space: ' ',
  backspace: 'Backspace',
  delete: 'Delete',
  home: 'Home',
  end: 'End',
  page_up: 'PageUp',
  page_down: 'PageDown',
  arrow_up: 'ArrowUp',
  arrow_down: 'ArrowDown',
  arrow_left: 'ArrowLeft',
  arrow_right: 'ArrowRight'
}
for (let i = 1; i <= 12; i++) KEYS[`f${i}`] = `F${i}`

const rx = (body: string): RegExp => new RegExp(`^\\s*${body}${TAIL}`)
const whole = (body: string): RegExp => new RegExp(`^\\s*${body}\\s*$`)

// The locator argument forms. The 3.x pair (:css, "x") is kept as the plain fallback the
// recorder stored; the 4.0 keyword forms carry the semantic locator steps.ts rendered.
const PAIR = whole(String.raw`:?(\w+)\s*,\s*(?:%q\((.+)\)|${S})`) // 1 strategy, 2 %q, 3-4 string
// Only the exact forms steps.ts writes have a Step: a plain `label: 'x'` or a by_role without
// exact: true is a substring match on 4.0, which no Locator says, so it stays custom
const KEYWORD = whole(String.raw`(id|css|xpath|test_id):\s*${S}`) // 1 key, 2-3 string
const EXACT = whole(String.raw`(label|text):\s*\[\s*${S}\s*,\s*\{\s*exact:\s*true\s*\}\s*\]`) // 1 key, 2-3 string
const ROLE = whole(String.raw`by_role\(\s*${S}\s*,\s*name:\s*${S}\s*,\s*exact:\s*true\s*\)`) // 1-2 role, 3-4 name

const isStrategy = (s: string): s is ElementTarget['strategy'] =>
  s === 'id' || s === 'css' || s === 'xpath'

// The project's test_id_attribute while a migration runs (parsing is synchronous), so a
// test_id: line carries the attribute the project actually uses
let testIdAttribute = DEFAULT_TEST_ID_ATTRIBUTE

function semantic(key: string, text: string): ElementTarget | null {
  // isLocator refuses an empty name, so an empty value has no locator to carry
  if (text === '') return null
  switch (key) {
    case 'label':
      return { strategy: 'xpath', value: labelXPath(text), locator: { by: 'label', text } }
    case 'text':
      return { strategy: 'xpath', value: textXPath(text), locator: { by: 'text', text } }
    case 'test_id':
      return {
        strategy: 'css',
        value: testIdCss(testIdAttribute, text),
        locator: { by: 'testId', attribute: testIdAttribute, value: text }
      }
    default:
      return null
  }
}

function plain(strategy: ElementTarget['strategy'], value: string): ElementTarget {
  if (value === '') return { strategy, value }
  switch (strategy) {
    case 'id':
      return { strategy, value, locator: { by: 'id', value } }
    case 'css':
      return { strategy, value, locator: { by: 'css', value, positional: false } }
    case 'xpath':
      return { strategy, value, locator: { by: 'xpath', value } }
  }
}

/** Reads the element target from the find_element argument; null when it has no Step form. */
function target(arg: string | undefined): ElementTarget | null {
  if (arg === undefined) return null
  let m = arg.match(PAIR)
  if (m) {
    if (!isStrategy(m[1])) return null
    return { strategy: m[1], value: m[2] !== undefined ? m[2] : str(m, 3) }
  }
  m = arg.match(ROLE)
  if (m) {
    const role = str(m, 1)
    const name = str(m, 3)
    const value = name === '' ? null : roleXPath(role, name, null)
    return value ? { strategy: 'xpath', value, locator: { by: 'role', role, name } } : null
  }
  m = arg.match(EXACT) ?? arg.match(KEYWORD)
  if (!m) return null
  const value = str(m, 2)
  return isStrategy(m[1]) ? plain(m[1], value) : semantic(m[1], value)
}

const CLEAR = rx(`${FIND}\\.clear`)
const SEND_TEXT = rx(`${FIND}\\.send_keys\\(${S}\\)`)
const SEND_KEY = rx(`${FIND}\\.send_keys\\(:(\\w+)\\)`)
const sameTarget = (a: ElementTarget, b: ElementTarget): boolean =>
  a.strategy === b.strategy && a.value === b.value

// distributes over the Step union so each built object is checked against its own kind
type Built = (Step extends infer S ? (S extends Step ? Omit<S, 'id'> : never) : never) | null
type Builder = (m: RegExpMatchArray) => Built

const withElement = (m: RegExpMatchArray, build: (element: ElementTarget) => Built): Built => {
  const element = target(m[1])
  return element ? build(element) : null
}

// An element assertion whose expected string, if any, is the literal at `expectedAt`
const assert =
  (check: AssertKind, expectedAt?: number): Builder =>
  (m) =>
    withElement(m, (element) =>
      expectedAt === undefined
        ? { kind: 'assert', check, element }
        : { kind: 'assert', check, element, expected: str(m, expectedAt) }
    )

const navigate: Builder = (m) => ({ kind: 'navigate', url: str(m, 1) })
const title: Builder = (m) => ({ kind: 'assert', check: 'titleEquals', expected: str(m, 1) })
const url: Builder = (m) => ({ kind: 'assert', check: 'urlIncludes', expected: str(m, 1) })

// Element matchers on the 4.0 runtime take the find in a block
const block = (matcher: string): RegExp => rx(`expect\\s*\\{\\s*${FIND}\\s*\\}\\.to ${matcher}`)

const PATTERNS: Array<[RegExp, Builder]> = [
  [rx(`${DRIVER}\\.get\\(${S}\\)`), navigate],
  [rx(`${DRIVER}\\.navigate\\.to\\(${S}\\)`), navigate],
  [
    rx(`@?wait\\.until\\s*\\{\\s*(!?)${FIND}\\.displayed\\?\\s*\\}`),
    (m): Built => {
      const element = target(m[2])
      return element ? { kind: 'wait', element, until: m[1] ? 'hidden' : 'visible' } : null
    }
  ],
  [
    rx(`@?wait\\.until\\s*\\{\\s*${FIND}\\.enabled\\?\\s*\\}`),
    (m): Built => withElement(m, (element) => ({ kind: 'wait', element, until: 'enabled' }))
  ],
  [rx(`${FIND}\\.click`), (m): Built => withElement(m, (element) => ({ kind: 'click', element }))],
  [
    SEND_KEY,
    (m): Built =>
      withElement(m, (element) => {
        const key = Object.hasOwn(KEYS, m[2]) ? KEYS[m[2]] : undefined
        return key ? { kind: 'pressKey', element, key } : null
      })
  ],
  [
    SEND_TEXT,
    (m): Built => withElement(m, (element) => ({ kind: 'type', element, text: str(m, 2) }))
  ],
  [rx(`${DRIVER}\\.switch_to\\.default_content`), (): Built => ({ kind: 'switchFrame' })],
  [
    rx(`${DRIVER}\\.switch_to\\.frame\\(\\s*${FIND}\\s*\\)`),
    (m): Built => withElement(m, (element) => ({ kind: 'switchFrame', element }))
  ],
  // 3.x assertions on the found element
  [rx(`expect\\(${FIND}\\)\\.to be_displayed`), assert('displayed')],
  [rx(`expect\\(${FIND}\\)\\.not_to be_displayed`), assert('notDisplayed')],
  [rx(`expect\\(${FIND}\\)\\.to be_enabled`), assert('enabled')],
  [rx(`expect\\(${FIND}\\)\\.to be_selected`), assert('checked')],
  [rx(`expect\\(${FIND}\\.text\\)\\.to eq\\(${S}\\)`), assert('textEquals', 2)],
  [rx(`expect\\(${FIND}\\.text\\)\\.to include\\(${S}\\)`), assert('textIncludes', 2)],
  [rx(`expect\\(${FIND}\\.attribute\\("value"\\)\\)\\.to eq\\(${S}\\)`), assert('valueEquals', 2)],
  [rx(`expect\\(${DRIVER}\\.title\\)\\.to eq\\(${S}\\)`), title],
  [rx(`expect\\(${DRIVER}\\.current_url\\)\\.to include\\(${S}\\)`), url],
  // 4.0 retrying matchers
  [block('be_visible'), assert('displayed')],
  [block('be_hidden'), assert('notDisplayed')],
  [block('be_enabled'), assert('enabled')],
  [block('be_checked'), assert('checked')],
  [block(`have_text\\(${S},\\s*exact:\\s*true\\s*\\)`), assert('textEquals', 2)],
  [block(`have_text\\(${S}\\)`), assert('textIncludes', 2)],
  [block(`have_value\\(${S}\\)`), assert('valueEquals', 2)],
  [rx(`expect\\(${DRIVER}\\)\\.to have_title\\(${S}\\)`), title],
  [rx(`expect\\s*\\{\\s*${DRIVER}\\.current_url\\s*\\}\\.to include\\(${S}\\)`), url]
]

const custom = (code: string): Step => ({ id: randomUUID(), kind: 'custom', code })

function parseLine(code: string): Step | null {
  for (const [regex, build] of PATTERNS) {
    const m = code.match(regex)
    if (!m) continue
    const built = build(m)
    if (built) return { id: randomUUID(), ...built } as Step
  }
  return null
}

/** clear + send_keys("…") on the same element -> one type step. */
function collapseType(clearLine: string, sendLine: string): Step | null {
  const c = clearLine.match(CLEAR)
  const s = sendLine.match(SEND_TEXT)
  if (!c || !s) return null
  const ce = target(c[1])
  const se = target(s[1])
  if (!ce || !se || !sameTarget(ce, se)) return null
  return { id: randomUUID(), kind: 'type', element: se, text: str(s, 2) }
}

export function migrateLegacyStep(code: string, attribute = DEFAULT_TEST_ID_ATTRIBUTE): Step {
  testIdAttribute = attribute
  const lines = code.split(/\r?\n/).filter((l) => l.trim() !== '')
  if (lines.length === 2) {
    const collapsed = collapseType(lines[0], lines[1])
    if (collapsed) return collapsed
  }
  return (lines.length <= 1 && parseLine(code)) || custom(code)
}

export function migrateLegacySteps(
  steps: unknown[],
  attribute = DEFAULT_TEST_ID_ATTRIBUTE
): Step[] {
  testIdAttribute = attribute
  const out: Step[] = []
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]
    if (isStep(s)) {
      out.push(s)
    } else if (typeof s === 'string') {
      const next = steps[i + 1]
      const collapsed = typeof next === 'string' ? collapseType(s, next) : null
      if (collapsed) {
        out.push(collapsed)
        i++
      } else if (s.trim() !== '') {
        out.push(migrateLegacyStep(s, attribute))
      }
    } else {
      out.push(custom(`# unrecognised step: ${JSON.stringify(s)}`))
    }
  }
  // Secret steps saved before names were stored are named once, in order
  return withSecretNames(out)
}

export function migrateLegacyTest(
  test: {
    id: string
    name: string
    url: string
    steps?: unknown
    hasTrace?: boolean
    trace?: unknown
  },
  attribute = DEFAULT_TEST_ID_ATTRIBUTE
): Test {
  const steps = Array.isArray(test.steps) ? test.steps : []
  return { ...test, steps: migrateLegacySteps(steps, attribute) } as Test
}
