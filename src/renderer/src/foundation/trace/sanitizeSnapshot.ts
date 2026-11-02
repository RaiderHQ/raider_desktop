// Re-sanitises a trace's HTML snapshot before it is shown. The snapshot comes
// from anywhere, so the producer's stripping is not trusted: this is the second
// layer behind the sandboxed iframe and SNAPSHOT_CSP. The page is parsed with
// DOMParser (which never runs scripts), cleaned as a DOM, and serialised again.

export const SNAPSHOT_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:"

export interface SnapshotLimits {
  maxInputChars: number
  maxOutputChars: number
}

const MiB = 1024 * 1024

// Below the zip reader's 32 MiB entry cap. Serialising escapes text, so the
// output may grow; past either cap the page is replaced by an empty one.
export const SNAPSHOT_LIMITS: SnapshotLimits = {
  maxInputChars: 16 * MiB,
  maxOutputChars: 32 * MiB
}

const DOCTYPE = '<!DOCTYPE html>'
const EMPTY_PAGE = `${DOCTYPE}<html><head><meta http-equiv="Content-Security-Policy" content="${SNAPSHOT_CSP}"></head><body></body></html>`
const MAX_PASSES = 4

const REMOVED_ELEMENTS = new Set([
  'script',
  'noscript',
  'template',
  'iframe',
  'frame',
  'frameset',
  'noframes',
  'object',
  'embed',
  'applet',
  'portal',
  'fencedframe',
  'base',
  'meta',
  'link',
  'noembed',
  'xmp',
  'plaintext',
  'foreignobject',
  'animate',
  'animatemotion',
  'animatetransform',
  'set',
  'discard'
])

// Never needed by a static page, whatever the value.
const DROPPED_ATTRIBUTES = new Set([
  'srcdoc',
  'action',
  'formaction',
  'srcset',
  'imagesrcset',
  'target',
  'formtarget',
  'ping'
])

const URL_ATTRIBUTES = new Set([
  'href',
  'src',
  'poster',
  'background',
  'data',
  'cite',
  'longdesc',
  'lowsrc',
  'dynsrc',
  'codebase',
  'classid',
  'archive',
  'manifest',
  'icon',
  'profile',
  'usemap'
])

const LINK_ELEMENTS = new Set(['a', 'area'])
const SVG_NS = 'http://www.w3.org/2000/svg'

// Entities are already decoded by the parser; whitespace and control
// characters are ignored by URL parsing, so "jav\tascript:" is still a scheme.
const normaliseUrl = (value: string): string =>
  value.replace(/[\s\x00-\x1f\x7f]/g, '').toLowerCase()

const isAllowedUrl = (value: string): boolean => {
  const url = normaliseUrl(value)
  return url.startsWith('data:image/') || url.startsWith('#')
}

export function sanitizeSnapshot(html: string, limits: SnapshotLimits = SNAPSHOT_LIMITS): string {
  if (typeof html !== 'string' || html.length > limits.maxInputChars) return EMPTY_PAGE
  try {
    // A page that changes when parsed again (mXSS) is cleaned again, until stable.
    let out = sanitizePass(html)
    for (let pass = 1; pass < MAX_PASSES; pass++) {
      if (out.length > limits.maxOutputChars) return EMPTY_PAGE
      const again = sanitizePass(out)
      if (again === out) return out
      out = again
    }
    return EMPTY_PAGE
  } catch {
    return EMPTY_PAGE
  }
}

function sanitizePass(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')

  removeComments(doc)
  for (const el of Array.from(doc.getElementsByTagName('*'))) {
    if (REMOVED_ELEMENTS.has(el.localName.toLowerCase())) el.remove()
  }
  for (const el of Array.from(doc.getElementsByTagName('*'))) {
    cleanAttributes(el)
    if (el.localName.toLowerCase() === 'style') el.textContent = sanitizeCss(el.textContent ?? '')
  }

  const csp = doc.createElement('meta')
  csp.setAttribute('http-equiv', 'Content-Security-Policy')
  csp.setAttribute('content', SNAPSHOT_CSP)
  doc.head.prepend(csp)

  return DOCTYPE + doc.documentElement.outerHTML
}

function removeComments(doc: Document): void {
  const walker = doc.createTreeWalker(
    doc,
    NodeFilter.SHOW_COMMENT | NodeFilter.SHOW_PROCESSING_INSTRUCTION
  )
  const found: Node[] = []
  while (walker.nextNode()) found.push(walker.currentNode)
  for (const node of found) node.parentNode?.removeChild(node)
}

function cleanAttributes(el: Element): void {
  const tag = el.localName.toLowerCase()
  const secret = isSecretField(el)
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase()
    // "xlink:href" and "href" share one rule, as do "xlink:onclick" and "onclick".
    const local = name.slice(name.lastIndexOf(':') + 1)
    if (
      local.startsWith('on') ||
      DROPPED_ATTRIBUTES.has(local) ||
      (LINK_ELEMENTS.has(tag) && local === 'href') ||
      (URL_ATTRIBUTES.has(local) && !isAllowedUrl(attr.value)) ||
      (secret && local === 'value')
    ) {
      el.removeAttribute(attr.name)
      continue
    }
    const isCss = local === 'style' || (el.namespaceURI === SVG_NS && attr.value.includes('('))
    if (isCss) {
      const css = sanitizeCss(attr.value)
      if (css === '') el.removeAttribute(attr.name)
      else if (css !== attr.value) el.setAttribute(attr.name, css)
    }
  }
}

// The same rule as capture: type=password, or an autocomplete naming a password.
function isSecretField(el: Element): boolean {
  if (el.localName.toLowerCase() !== 'input') return false
  const type = (el.getAttribute('type') ?? '').trim().toLowerCase()
  const autocomplete = (el.getAttribute('autocomplete') ?? '').toLowerCase()
  return type === 'password' || autocomplete.includes('password')
}

// --- CSS ---------------------------------------------------------------------
// A small scanner that follows CSS tokenising (strings, comments, escapes) just
// far enough to find function names and at-rules, so "u\72l(" and "URL(" are
// seen as url(). Everything it doesn't rewrite is copied as written.

// Functions whose arguments may name a resource to fetch.
const RESOURCE_FUNCTIONS = new Set([
  'expression',
  'image',
  'image-set',
  '-webkit-image-set',
  'src',
  'element',
  '-moz-element'
])

const isHex = (c: string): boolean => /^[0-9a-f]$/i.test(c)
const isWhitespace = (c: string): boolean =>
  c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f'
const isNameChar = (c: string): boolean => /^[a-z0-9_-]$/i.test(c) || c.charCodeAt(0) > 0x7f

export function sanitizeCss(css: string): string {
  // No legitimate sheet needs "<", and without it nothing can close the
  // <style> element early or turn into markup when parsed again.
  if (css.includes('<')) return ''
  return new CssScanner(css).run()
}

class CssScanner {
  private i = 0
  private out = ''

  constructor(private readonly css: string) {}

  run(): string {
    const { css } = this
    while (this.i < css.length) {
      const c = css[this.i]
      if (c === '/' && css[this.i + 1] === '*') {
        this.skipComment()
        this.out += ' '
      } else if (c === '"' || c === "'") {
        const start = this.i
        this.readString()
        this.out += css.slice(start, this.i)
      } else if (c === '@') {
        this.i++
        const start = this.i
        const name = this.readName()
        if (name.toLowerCase() === 'import') this.skipStatement()
        else this.out += '@' + css.slice(start, this.i)
      } else if (isNameChar(c) || c === '\\') {
        this.readNameOrFunction()
      } else {
        this.out += c
        this.i++
      }
    }
    return this.out
  }

  private readNameOrFunction(): void {
    const { css } = this
    const start = this.i
    const name = this.readName().toLowerCase()
    const raw = css.slice(start, this.i)
    // Being stricter than CSS here: a comment between name and "(" still counts.
    const open = this.skipCommentsFrom(this.i)
    if (css[open] !== '(') {
      this.out += raw
      return
    }
    if (name === 'url') {
      this.i = open + 1
      const value = this.readUrlArgument()
      this.out += value !== null && isAllowedUrl(value) ? css.slice(start, this.i) : 'none'
    } else if (RESOURCE_FUNCTIONS.has(name)) {
      this.i = open + 1
      this.skipBalanced()
      this.out += 'none'
    } else {
      this.out += raw + '('
      this.i = open + 1
    }
  }

  // Reads an identifier, decoding escapes, and returns the decoded name.
  private readName(): string {
    const { css } = this
    let name = ''
    while (this.i < css.length) {
      const c = css[this.i]
      if (c === '\\') name += this.readEscape()
      else if (isNameChar(c)) {
        name += c
        this.i++
      } else break
    }
    return name
  }

  private readEscape(): string {
    const { css } = this
    this.i++ // the backslash
    if (this.i >= css.length) return ''
    if (!isHex(css[this.i])) return css[this.i++]
    let hex = ''
    while (hex.length < 6 && this.i < css.length && isHex(css[this.i])) hex += css[this.i++]
    if (css[this.i] === '\r' && css[this.i + 1] === '\n') this.i += 2
    else if (this.i < css.length && isWhitespace(css[this.i])) this.i++
    const code = parseInt(hex, 16)
    return code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff)
      ? String.fromCodePoint(code)
      : '�'
  }

  // Reads a quoted string from its opening quote and returns the decoded value.
  private readString(): string {
    const { css } = this
    const quote = css[this.i++]
    let value = ''
    while (this.i < css.length) {
      const c = css[this.i]
      if (c === quote) {
        this.i++
        break
      }
      if (c === '\n') break
      if (c === '\\') value += this.readEscape()
      else {
        value += c
        this.i++
      }
    }
    return value
  }

  // Reads url( … ) after the "(". Returns null when it is never closed.
  private readUrlArgument(): string | null {
    const { css } = this
    while (this.i < css.length && isWhitespace(css[this.i])) this.i++
    let value = ''
    if (css[this.i] === '"' || css[this.i] === "'") {
      value = this.readString()
      while (this.i < css.length && css[this.i] !== ')') this.i++
    } else {
      while (this.i < css.length && css[this.i] !== ')') {
        if (css[this.i] === '\\') value += this.readEscape()
        else value += css[this.i++]
      }
    }
    if (css[this.i] !== ')') return null
    this.i++
    return value
  }

  private skipComment(): void {
    const end = this.css.indexOf('*/', this.i + 2)
    this.i = end < 0 ? this.css.length : end + 2
  }

  private skipCommentsFrom(at: number): number {
    const { css } = this
    let j = at
    while (css[j] === '/' && css[j + 1] === '*') {
      const end = css.indexOf('*/', j + 2)
      j = end < 0 ? css.length : end + 2
    }
    return j
  }

  // Skips to the ")" that closes the current function, past nested ones and strings.
  private skipBalanced(): void {
    const { css } = this
    let depth = 1
    while (this.i < css.length && depth > 0) {
      const c = css[this.i]
      if (c === '"' || c === "'") this.readString()
      else if (c === '\\') this.readEscape()
      else {
        if (c === '(') depth++
        else if (c === ')') depth--
        this.i++
      }
    }
  }

  // Skips an @import up to and including its ";".
  private skipStatement(): void {
    const { css } = this
    while (this.i < css.length) {
      const c = css[this.i]
      if (c === '"' || c === "'") this.readString()
      else if (c === '\\') this.readEscape()
      else if (c === '/' && css[this.i + 1] === '*') this.skipComment()
      else {
        this.i++
        if (c === ';') return
      }
    }
  }
}
