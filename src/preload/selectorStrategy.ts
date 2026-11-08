import type { Locator, Strategy } from '../shared/types/step'
import { DEFAULT_TEST_ID_ATTRIBUTE } from '../shared/testIdAttribute'
import {
  NAME_MAX,
  accessibleNameSource,
  labelText,
  looksGenerated,
  normalizedText,
  roleOf
} from './accessibleName'
import {
  cssEscape,
  labelXPath,
  roleXPath,
  testIdCss,
  textXPath,
  xpathLiteral
} from '../shared/locatorSelectors'
import { DEFAULT_SELECTOR_PRIORITY } from '../shared/selectorPriority'

// The string builders moved to shared (the legacy parser synthesises the same fallbacks);
// re-exported so the preload and tests keep importing them from here
export { cssEscape, xpathLiteral }

// The shared default; used until the project's config arrives.
export const DEFAULT_PRIORITIES: string[] = [...DEFAULT_SELECTOR_PRIORITY]
export { DEFAULT_TEST_ID_ATTRIBUTE }

export function getCssPath(el: Element): string {
  if (!(el instanceof Element)) return ''
  const path: string[] = []
  while (el.nodeType === Node.ELEMENT_NODE) {
    let selector = el.nodeName.toLowerCase()
    // A generated id changes between page loads, so the path keeps walking up instead
    if (el.id && !looksGenerated(el.id)) {
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

export function getXPath(element: Element): string {
  if (element.id !== '' && !looksGenerated(element.id)) {
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

function byRole(el: Element): Candidate | null {
  const role = roleOf(el)
  const named = accessibleNameSource(el)
  if (!role || !named) return null
  const { name } = named
  // Kept for future readable forms (no consumer today): 'aria-label' only when the name is the raw attribute
  const nameFrom =
    named.from === 'aria-label' && el.getAttribute('aria-label') !== name ? 'other' : named.from
  const selector = roleXPath(role, name, el.getAttribute('aria-labelledby'))
  if (!selector) return null
  return checked(el, {
    selector,
    strategy: 'xpath',
    locator: { by: 'role', role, name, nameFrom, tag: el.tagName.toLowerCase() }
  })
}

function byLabel(el: Element): Candidate | null {
  const text = labelText(el)
  if (!text) return null
  return checked(el, {
    selector: labelXPath(text),
    strategy: 'xpath',
    locator: { by: 'label', text }
  })
}

function byTestId(el: Element, attribute: string): Candidate | null {
  const value = el.getAttribute(attribute)
  if (!value) return null
  return checked(el, {
    selector: testIdCss(attribute, value),
    strategy: 'css',
    locator: { by: 'testId', attribute, value }
  })
}

// Layout elements: a click on one of these is a click on a region, not on a piece of text
const CONTAINER_TAGS = new Set([
  'html',
  'body',
  'div',
  'section',
  'main',
  'article',
  'form',
  'header',
  'footer',
  'nav',
  'aside',
  'ul',
  'ol',
  'table',
  'tbody',
  'thead',
  'tfoot',
  'tr',
  'td',
  'th',
  'li',
  'dl',
  'figure',
  'details',
  'dialog',
  'fieldset'
])

// Words the element carries in its own text nodes; separators alone ("|", "·") don't count
const ownText = (el: Element): string => {
  const text = Array.from(el.childNodes)
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent ?? '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  return /[\p{L}\p{N}]/u.test(text) ? text : ''
}

/** A click on a layout element with no words of its own: a region of the page, not a thing on it. */
export const isRegion = (el: Element): boolean =>
  CONTAINER_TAGS.has(el.tagName.toLowerCase()) && !ownText(el)

// The innermost element carrying the text: a parent whose child has the same text defers to it.
// A container with no words of its own is not named by the words of the things inside it
// (that would be the whole page text for a click on the page background) (D16).
function byText(el: Element): Candidate | null {
  const text = normalizedText(el)
  if (!text || text.length > NAME_MAX) return null
  if (Array.from(el.children).some((child) => normalizedText(child) === text)) return null
  if (isRegion(el)) return null
  return checked(el, {
    selector: textXPath(text),
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
