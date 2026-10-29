export type SelectorStrategy = 'id' | 'css' | 'xpath'

export const DEFAULT_PRIORITIES: string[] = ['id', 'data-testid', 'css', 'xpath']

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
      if (nth != 1) selector += ':nth-of-type(' + nth + ')'
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
    return element.tagName.toLowerCase()
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

// An invalid selector (e.g. a malformed attribute name) must not break recording.
function isUnique(selector: string): boolean {
  try {
    return document.querySelectorAll(selector).length === 1
  } catch {
    return false
  }
}

export function getPrioritizedSelector(
  el: Element,
  priorities: string[]
): { selector: string; strategy: SelectorStrategy } | { selector: ''; strategy: '' } {
  for (const priority of priorities) {
    if (priority === 'id') {
      if (el.id && isUnique(`#${cssEscape(el.id)}`)) {
        return { selector: el.id, strategy: 'id' }
      }
    } else if (priority === 'css') {
      const selector = getCssPath(el)
      if (selector && isUnique(selector)) {
        return { selector, strategy: 'css' }
      }
    } else if (priority === 'xpath') {
      const selector = getXPath(el)
      if (selector) return { selector, strategy: 'xpath' }
    } else {
      // Any other priority is an attribute name, e.g. data-testid
      const value = el.getAttribute(priority)
      if (value) {
        const selector = `[${priority}="${cssEscape(value)}"]`
        if (isUnique(selector)) return { selector, strategy: 'css' }
      }
    }
  }
  // Fallback to a robust selector if no priority matches
  const cssPath = getCssPath(el)
  if (cssPath) return { selector: cssPath, strategy: 'css' }

  const xpath = getXPath(el)
  if (xpath) return { selector: xpath, strategy: 'xpath' }

  return { selector: '', strategy: '' }
}
