// Pure string builders for the Selenium fallback behind a semantic locator: the recorder
// (preload) resolves them against the page, and the legacy parser (main) synthesises the
// same fallback when it reads a 4.0 line back. No DOM access here, so both can import it.

// Input types typed into as text; a missing type is a text field.
export const TEXT_INPUT_TYPES = ['text', 'email', 'password', 'search', 'tel', 'url', 'number']

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

// XPath 1.0 string literals have no escape character, so a value holding both
// quote types has to be stitched together with concat().
export function xpathLiteral(value: string): string {
  if (!value.includes('"')) return `"${value}"`
  if (!value.includes("'")) return `'${value}'`
  const parts = value.split("'").map((part) => `'${part}'`)
  return `concat(${parts.join(`,"'",`)})`
}

const BUTTON_INPUT = "input[@type='submit' or @type='button' or @type='reset']"
const IMAGE_INPUT = "input[@type='image']"
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

/** True for the roles roleXPath knows how to find. */
export const isKnownRole = (role: string): boolean => Object.hasOwn(ROLE_KINDS, role)

/**
 * A union over every way the name can be given, so it finds the element whichever
 * source named it; the uniqueness check rejects it if it also finds anything else.
 * aria-labelledby is matched by its literal ids, and only when the target uses it, and a
 * label's field is reached through id(), so the expression never scans the whole document
 * per candidate node. Null for a role outside the known table.
 */
export function roleXPath(role: string, name: string, labelledBy: string | null): string | null {
  if (!isKnownRole(role)) return null
  const n = xpathLiteral(name)
  const { kinds, byContent } = ROLE_KINDS[role]
  const named = `[normalize-space()=${n} or @aria-label=${n}]`
  const parts = kinds.flatMap((kind) =>
    byContent
      ? [`//${kind}${named}`]
      : [
          `id(//label[normalize-space()=${n}]/@for)/self::${kind}`,
          `//label[normalize-space()=${n}]//${kind}`,
          `//${kind}[@aria-label=${n}]`,
          `//${kind}[@placeholder=${n}]`
        ]
  )
  if (role === 'button') {
    parts.push(
      `//${BUTTON_INPUT}[@value=${n} or @aria-label=${n}]`,
      `//${IMAGE_INPUT}[@alt=${n} or @aria-label=${n}]`
    )
  }
  const explicit = `*[@role=${xpathLiteral(role)}]`
  parts.push(`//${explicit}${named}`)
  if (labelledBy) {
    const ids = xpathLiteral(labelledBy)
    parts.push(...[...kinds, explicit].map((kind) => `//${kind}[@aria-labelledby=${ids}]`))
  }
  return parts.join(' | ')
}

// The tags the runtime treats as controls inside a wrapping label (Raider::Selectors::LABEL_CONTROLS).
const LABEL_CONTROLS = ['input', 'textarea', 'select', 'button', 'meter', 'output', 'progress']
  .map((tag) => `self::${tag}`)
  .join(' or ')

/**
 * Mirrors Raider::Selectors.label(value, exact: true) branch for branch, so the recorder's
 * uniqueness check sees exactly the candidates strict mode will match: (a) whatever a label[for]
 * with this text points at (any element, not only a form control), (b) the controls inside
 * such a label except hidden inputs, (c) an element whose normalized aria-label is the text,
 * (d) an element whose aria-labelledby target has the text. Branch (a) is spelt id(...) rather
 * than the runtime's //*[@id = //label[...]/@for]: the same nodes, but jsdom evaluates the
 * latter once per element (25 s on a 500-row form against 30 ms). The two differ only for a
 * duplicated id (id() yields the first) or a `for` holding whitespace (id() splits it).
 */
export function labelXPath(text: string): string {
  const t = xpathLiteral(text)
  const label = `//label[normalize-space(.)=${t}]`
  return [
    `id(${label}/@for)`,
    `${label}//*[(${LABEL_CONTROLS}) and not(self::input[@type='hidden'])]`,
    `//*[normalize-space(@aria-label)=${t}]`,
    `//*[@aria-labelledby and normalize-space(string(id(@aria-labelledby)))=${t}]`
  ].join(' | ')
}

/** The innermost element whose normalized text is exactly this. */
export function textXPath(text: string): string {
  const t = xpathLiteral(text)
  return `//*[normalize-space()=${t}][not(*[normalize-space()=${t}])]`
}

/** Attribute selector for a test id, e.g. [data-testid="x"]. */
export function testIdCss(attribute: string, value: string): string {
  return `[${attribute}="${cssEscape(value)}"]`
}
