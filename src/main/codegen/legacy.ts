import { randomUUID } from 'node:crypto'
import { isStep } from '../../shared/types/step'
import type { AssertKind, ElementTarget, Step } from '../../shared/types/step'
import type { Test } from '../../shared/types/test'

/**
 * One-time converter from legacy recorded Ruby strings to structured Steps.
 * Recognises the forms produced by the old recorder (frameworkTemplates,
 * xpathConverter) and the patterns of the old commandParser/xpathParser.
 * Anything it cannot map losslessly becomes a `custom` step.
 */

/** Kept as an alias: a migrated test is a plain Test now that steps are Step[]. */
export type MigratedTest = Test

// find_element(:strategy, <ruby string>) — capture groups: strategy, %q(), "…", '…'
const FE = String.raw`@?driver\.find_element\(:?(\w+)[,:]\s*(?:%q\((.+?)\)|"((?:\\.|[^"\\])*)"|'([^']*)')\)`
const STR = String.raw`"((?:\\.|[^"\\])*)"`
const TAIL = String.raw`(?:\s+#.*)?\s*$`

const unescape = (s: string): string => s.replace(/\\(["\\])/g, '$1')

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

/** Reads the element target from 4 capture groups starting at `at`. */
function target(m: RegExpMatchArray, at: number): ElementTarget | null {
  const strategy = m[at]
  if (strategy !== 'id' && strategy !== 'css' && strategy !== 'xpath') return null
  const value = m[at + 1] ?? (m[at + 2] !== undefined ? unescape(m[at + 2]) : m[at + 3])
  return value === undefined ? null : { strategy, value }
}

const CLEAR = rx(`${FE}\\.clear`)
const SEND_TEXT = rx(`${FE}\\.send_keys\\(${STR}\\)`)
const SEND_KEY = rx(`${FE}\\.send_keys\\(:(\\w+)\\)`)
const sameTarget = (a: ElementTarget, b: ElementTarget): boolean =>
  a.strategy === b.strategy && a.value === b.value

// distributes over the Step union so each built object is checked against its own kind
type Built = (Step extends infer S ? (S extends Step ? Omit<S, 'id'> : never) : never) | null
type Builder = (m: RegExpMatchArray) => Built

const el = (m: RegExpMatchArray, kind: 'assert', check: AssertKind, expectedAt?: number): Built => {
  const element = target(m, 1)
  if (!element) return null
  return expectedAt === undefined
    ? { kind, check, element }
    : { kind, check, element, expected: unescape(m[expectedAt]) }
}

const PATTERNS: Array<[RegExp, Builder]> = [
  [rx(`@?driver\\.get\\(${STR}\\)`), (m): Built => ({ kind: 'navigate', url: unescape(m[1]) })],
  [
    rx(`@?wait\\.until\\s*\\{\\s*(!?)${FE}\\.displayed\\?\\s*\\}`),
    (m): Built => {
      const element = target(m, 2)
      return element ? { kind: 'wait', element, until: m[1] ? 'hidden' : 'visible' } : null
    }
  ],
  [
    rx(`@?wait\\.until\\s*\\{\\s*${FE}\\.enabled\\?\\s*\\}`),
    (m): Built => {
      const element = target(m, 1)
      return element ? { kind: 'wait', element, until: 'enabled' } : null
    }
  ],
  [
    rx(`${FE}\\.click`),
    (m): Built => {
      const element = target(m, 1)
      return element ? { kind: 'click', element } : null
    }
  ],
  [
    SEND_KEY,
    (m): Built => {
      const element = target(m, 1)
      const key = Object.hasOwn(KEYS, m[5]) ? KEYS[m[5]] : undefined
      return element && key ? { kind: 'pressKey', element, key } : null
    }
  ],
  [
    SEND_TEXT,
    (m): Built => {
      const element = target(m, 1)
      return element ? { kind: 'type', element, text: unescape(m[5]) } : null
    }
  ],
  [rx(String.raw`@?driver\.switch_to\.default_content`), (): Built => ({ kind: 'switchFrame' })],
  [
    rx(`@?driver\\.switch_to\\.frame\\(\\s*${FE}\\s*\\)`),
    (m): Built => {
      const element = target(m, 1)
      return element ? { kind: 'switchFrame', element } : null
    }
  ],
  [rx(`expect\\(${FE}\\)\\.to be_displayed`), (m): Built => el(m, 'assert', 'displayed')],
  [rx(`expect\\(${FE}\\)\\.not_to be_displayed`), (m): Built => el(m, 'assert', 'notDisplayed')],
  [rx(`expect\\(${FE}\\)\\.to be_enabled`), (m): Built => el(m, 'assert', 'enabled')],
  [rx(`expect\\(${FE}\\)\\.to be_selected`), (m): Built => el(m, 'assert', 'checked')],
  [
    rx(`expect\\(${FE}\\.text\\)\\.to eq\\(${STR}\\)`),
    (m): Built => el(m, 'assert', 'textEquals', 5)
  ],
  [
    rx(`expect\\(${FE}\\.text\\)\\.to include\\(${STR}\\)`),
    (m): Built => el(m, 'assert', 'textIncludes', 5)
  ],
  [
    rx(`expect\\(${FE}\\.attribute\\("value"\\)\\)\\.to eq\\(${STR}\\)`),
    (m): Built => el(m, 'assert', 'valueEquals', 5)
  ],
  [
    rx(`expect\\(@?driver\\.title\\)\\.to eq\\(${STR}\\)`),
    (m): Built => ({ kind: 'assert', check: 'titleEquals', expected: unescape(m[1]) })
  ],
  [
    rx(`expect\\(@?driver\\.current_url\\)\\.to include\\(${STR}\\)`),
    (m): Built => ({ kind: 'assert', check: 'urlIncludes', expected: unescape(m[1]) })
  ]
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
  const ce = target(c, 1)
  const se = target(s, 1)
  if (!ce || !se || !sameTarget(ce, se)) return null
  return { id: randomUUID(), kind: 'type', element: se, text: unescape(s[5]) }
}

export function migrateLegacyStep(code: string): Step {
  const lines = code.split(/\r?\n/).filter((l) => l.trim() !== '')
  if (lines.length === 2) {
    const collapsed = collapseType(lines[0], lines[1])
    if (collapsed) return collapsed
  }
  return (lines.length <= 1 && parseLine(code)) || custom(code)
}

export function migrateLegacySteps(steps: unknown[]): Step[] {
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
        out.push(migrateLegacyStep(s))
      }
    } else {
      out.push(custom(`# unrecognised step: ${JSON.stringify(s)}`))
    }
  }
  return out
}

export function migrateLegacyTest(test: {
  id: string
  name: string
  url: string
  steps?: unknown
  hasTrace?: boolean
  trace?: unknown
}): Test {
  const steps = Array.isArray(test.steps) ? test.steps : []
  return { ...test, steps: migrateLegacySteps(steps) } as Test
}
