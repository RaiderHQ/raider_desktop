import type { Locator, Strategy } from '../shared/types/step'
import {
  NAME_MAX,
  TEXT_INPUT_TYPES,
  accessibleName,
  labelText,
  looksGenerated,
  normalizedText,
  roleOf
} from './accessibleName'

// Mirrors DEFAULT_SELECTOR_PRIORITY in main; used until the project's config arrives.
export const DEFAULT_PRIORITIES: string[] = [
  'role',
  'label',
  'testId',
  'text',
  'id',
  'css',
  'xpath'
]
export const DEFAULT_TEST_ID_ATTRIBUTE = 'data-testid'

// CSSOM "serialize an identifier" algorithm, used when CSS.escape is unavailable.
function cssEscapeFallback(value: string): string {
  const length = value.length
  const first = value.charCodeAt(0)
  let result = ''
  for (let i = 0; i < length; i++) {
    const code = value.charCodeAt(i)
    if (code === 0) {
      result += '�'
    } else if (
      (code >= 0x1 && code <= 0x1f) ||
      code === 0x7f ||
      (i === 0 && code >= 0x30 && code <= 0x39) ||
      (i === 1 && code >= 0x30 && code <= 0x39 && first === 0x2d)
    ) {
      result += '\\' + code.toString(16) + ' '
    } else if (i === 0 && length === 1 && code === 0x2d) {
      result += '\\' + value.charAt(i)
    } else if (
      code >= 0x80 ||
      code === 0x2d ||
      code === 0x5f ||
      (code >= 0x30 && code <= 0x39) ||
      (code >= 0x41 && code <= 0x5a) ||
      (code >= 0x61 && code <= 0x7a)
    ) {
      result += value.charAt(i)
    } else {
      result += '\\' + value.charAt(i)
    }
  }
  return result
}

export function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value)
  return cssEscapeFallback(value)
}

export function getCssPath(el: Element): string {
  if (!(el instanceof Element)) return ''
  const path: string[] = []
  while (el.nodeType === Node.ELEMENT_NODE) {
    let selector = el.nodeName.toLowerCase()
    if (el.id) {
      selector = '#' + cssEscape(el.id)
      path.unshift(selector)
      break
    } else {
      let sib = el,
        nth = 1
      while ((sib = sib.previousElementSibling!)) {
        if (sib.nodeName.toLowerCase() == selector) nth++
      }
      // A first child still needs its index when later siblings share its tag
      let later = false
      for (let next = el.nextElementSibling; next && !later; next = next.nextElementSibling) {
        later = next.nodeName.toLowerCase() == selector
      }
      if (nth != 1 || later) selector += ':nth-of-type(' + nth + ')'
    }
    path.unshift(selector)
    el = el.parentNode as Element
  }
  return path.join(' > ')
}

// XPath 1.0 string literals have no escape character, so a value holding both
// quote types has to be stitched together with concat().
export function xpathLiteral(value: string): string {
  if (!value.includes('"')) return `"${value}"`
  if (!value.includes("'")) return `'${value}'`
  const parts = value.split("'").map((part) => `'${part}'`)
  return `concat(${parts.join(`,"'",`)})`
}

export function getXPath(element: Element): string {
  if (element.id !== '') {
    return `//*[@id=${xpathLiteral(element.id)}]`
  }
  if (element === document.body) {
    return '/html/body'
  }

  let ix = 0
  const siblings = element.parentNode?.children || new HTMLCollection()

  for (let i = 0; i < siblings.length; i++) {
    const sibling = siblings[i]
    if (sibling === element) {
      return (
        getXPath(element.parentElement as Element) +
        '/' +
        element.tagName.toLowerCase() +
        '[' +
        (ix + 1) +
        ']'
      )
    }
    if (sibling.nodeType === 1 && sibling.tagName === element.tagName) {
      ix++
    }
  }
  return ''
}

// Index-only path from the root, ignoring ids, so duplicated ids can't make it ambiguous.
function absoluteXPath(el: Element): string {
  const parts: string[] = []
  for (let node: Element | null = el; node; node = node.parentElement) {
    const tag = node.tagName.toLowerCase()
    const test =
      node.namespaceURI === 'http://www.w3.org/1999/xhtml' ? tag : `*[local-name()='${tag}']`
    const parent = node.parentElement
    const same = parent
      ? Array.from(parent.children).filter((c) => c.tagName === node!.tagName)
      : []
    parts.unshift(same.length > 1 ? `${test}[${same.indexOf(node) + 1}]` : test)
  }
  return '/' + parts.join('/')
}

// An invalid selector (e.g. a malformed attribute name) must not break recording.
function cssMatches(selector: string): NodeListOf<Element> | null {
  try {
    return document.querySelectorAll(selector)
  } catch {
    return null
  }
}

function xpathSnapshot(xpath: string): XPathResult | null {
  try {
    return document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null)
  } catch {
    return null
  }
}

/** How many elements an XPath matches; 0 for an invalid expression. */
export function xpathCount(xpath: string): number {
  return xpathSnapshot(xpath)?.snapshotLength ?? 0
}

function isUnique(selector: string): boolean {
  return cssMatches(selector)?.length === 1
}

type Candidate = { selector: string; strategy: Strategy; locator: Locator }

// Unique is not enough: the single match has to be the element the user acted on.
function findsOnly(el: Element, strategy: Strategy, selector: string): boolean {
  if (strategy === 'xpath') {
    const snap = xpathSnapshot(selector)
    return snap?.snapshotLength === 1 && snap.snapshotItem(0) === el
  }
  const css = strategy === 'id' ? `#${cssEscape(selector)}` : selector
  return isUnique(css) && document.querySelector(css) === el
}

const checked = (el: Element, pick: Candidate): Candidate | null =>
  pick.selector && findsOnly(el, pick.strategy, pick.selector) ? pick : null

const BUTTON_INPUT = "input[@type='submit' or @type='button' or @type='reset']"
const TEXT_INPUT = `input[not(@type) or ${TEXT_INPUT_TYPES.map((t) => `@type='${t}'`).join(' or ')}]`
const HEADING = '*[self::h1 or self::h2 or self::h3 or self::h4 or self::h5 or self::h6]'

// Node tests per role; buttons, links and headings are also named by their content.
const ROLE_KINDS: Record<string, { kinds: string[]; byContent: boolean }> = {
  button: { kinds: ['button'], byContent: true },
  link: { kinds: ['a[@href]'], byContent: true },
  heading: { kinds: [HEADING], byContent: true },
  textbox: { kinds: ['textarea', TEXT_INPUT], byContent: false },
  checkbox: { kinds: ["input[@type='checkbox']"], byContent: false },
  radio: { kinds: ["input[@type='radio']"], byContent: false },
  combobox: { kinds: ['select'], byContent: false }
}

// A union over every way the name can be given, so it finds the element whichever
// source named it; the uniqueness check rejects it if it also finds anything else.
function roleXPath(role: string, name: string): string {
  const n = xpathLiteral(name)
  const { kinds, byContent } = ROLE_KINDS[role]
  const named = `[normalize-space()=${n} or @aria-label=${n}]`
  const parts = kinds.flatMap((kind) =>
    byContent
      ? [`//${kind}${named}`]
      : [
          `//${kind}[@id=//label[normalize-space()=${n}]/@for]`,
          `//label[normalize-space()=${n}]//${kind}`,
          `//${kind}[@aria-label=${n}]`,
          `//${kind}[@placeholder=${n}]`
        ]
  )
  if (role === 'button') parts.push(`//${BUTTON_INPUT}[@value=${n} or @aria-label=${n}]`)
  parts.push(
    `//*[@role=${xpathLiteral(role)}]${named}`,
    ...[...kinds, `*[@role=${xpathLiteral(role)}]`].map(
      (kind) => `//${kind}[@aria-labelledby=//*[normalize-space()=${n}]/@id]`
    )
  )
  return parts.join(' | ')
}

function byRole(el: Element): Candidate | null {
  const role = roleOf(el)
  const name = accessibleName(el)
  if (!role || !(role in ROLE_KINDS) || !name) return null
  return checked(el, {
    selector: roleXPath(role, name),
    strategy: 'xpath',
    locator: { by: 'role', role, name }
  })
}

function byLabel(el: Element): Candidate | null {
  const text = labelText(el)
  if (!text) return null
  const t = xpathLiteral(text)
  const selector =
    `//*[@id=//label[normalize-space()=${t}]/@for]` +
    ` | //label[normalize-space()=${t}]//*[self::input or self::textarea or self::select]` +
    ` | //*[@aria-label=${t}]`
  return checked(el, { selector, strategy: 'xpath', locator: { by: 'label', text } })
}

function byTestId(el: Element, attribute: string): Candidate | null {
  const value = el.getAttribute(attribute)
  if (!value) return null
  return checked(el, {
    selector: `[${attribute}="${cssEscape(value)}"]`,
    strategy: 'css',
    locator: { by: 'testId', attribute, value }
  })
}

// The innermost element carrying the text: a parent whose child has the same text defers to it.
function byText(el: Element): Candidate | null {
  const text = normalizedText(el)
  if (!text || text.length > NAME_MAX) return null
  if (Array.from(el.children).some((child) => normalizedText(child) === text)) return null
  const t = xpathLiteral(text)
  return checked(el, {
    selector: `//*[normalize-space()=${t}][not(*[normalize-space()=${t}])]`,
    strategy: 'xpath',
    locator: { by: 'text', text }
  })
}

function byId(el: Element): Candidate | null {
  if (!el.id || looksGenerated(el.id)) return null
  return checked(el, { selector: el.id, strategy: 'id', locator: { by: 'id', value: el.id } })
}

const SHORT_CSS_ATTRIBUTES = ['name', 'type', 'title', 'alt', 'placeholder', 'aria-label']
const GENERATED_CLASS = /^(css|sc|jsx|emotion)-/

// The tag plus at most two attribute or class tokens; generated-looking classes are skipped.
function shortCss(el: Element): string | null {
  const tag = el.tagName.toLowerCase()
  const tokens = [
    ...SHORT_CSS_ATTRIBUTES.filter((a) => el.getAttribute(a)).map(
      (a) => `[${a}="${cssEscape(el.getAttribute(a)!)}"]`
    ),
    ...Array.from(el.classList)
      .filter((c) => !looksGenerated(c) && !GENERATED_CLASS.test(c))
      .map((c) => `.${cssEscape(c)}`)
  ].slice(0, 6)
  const singles = tokens.map((t) => tag + t)
  const pairs = tokens.flatMap((a, i) => tokens.slice(i + 1).map((b) => tag + a + b))
  return [...singles, ...pairs].find((selector) => findsOnly(el, 'css', selector)) ?? null
}

function byCss(el: Element): Candidate | null {
  const short = shortCss(el)
  if (short) {
    return {
      selector: short,
      strategy: 'css',
      locator: { by: 'css', value: short, positional: false }
    }
  }
  const path = getCssPath(el)
  return checked(el, {
    selector: path,
    strategy: 'css',
    locator: { by: 'css', value: path, positional: true }
  })
}

// Always finds the element: the id-anchored path when it resolves, else the index-only one.
function byXPath(el: Element): Candidate {
  const anchored = getXPath(el)
  const selector = anchored && findsOnly(el, 'xpath', anchored) ? anchored : absoluteXPath(el)
  return { selector, strategy: 'xpath', locator: { by: 'xpath', value: selector } }
}

/**
 * The first candidate in priority order whose resolved Selenium form finds exactly this
 * element. Names other than the known ones are test-id attributes (e.g. data-cy).
 */
export function getPrioritizedSelector(
  el: Element,
  priorities: string[],
  testIdAttribute: string = DEFAULT_TEST_ID_ATTRIBUTE
): { selector: string; strategy: Strategy | ''; locator?: Locator } {
  if (!(el instanceof Element)) return { selector: '', strategy: '' }
  for (const priority of priorities) {
    let pick: Candidate | null
    if (priority === 'role') pick = byRole(el)
    else if (priority === 'label') pick = byLabel(el)
    else if (priority === 'testId') pick = byTestId(el, testIdAttribute)
    else if (priority === 'text') pick = byText(el)
    else if (priority === 'id') pick = byId(el)
    else if (priority === 'css') pick = byCss(el)
    else if (priority === 'xpath') pick = byXPath(el)
    else pick = byTestId(el, priority)
    if (pick) return pick
  }
  return byCss(el) ?? byXPath(el)
}
