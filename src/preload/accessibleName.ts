// Names and roles as a user perceives them, approximated without layout so it
// behaves the same in a real page and in jsdom.

export const NAME_MAX = 80

// Input types typed into as text; a missing type is a text field.
export const TEXT_INPUT_TYPES = ['text', 'email', 'password', 'search', 'tel', 'url', 'number']
const BUTTON_INPUT_TYPES = ['button', 'submit', 'reset']
const NAMED_BY_CONTENT = ['button', 'link', 'heading']

const squash = (text: string | null | undefined): string => (text ?? '').replace(/\s+/g, ' ').trim()

/** Collapses whitespace runs; layout-free stand-in for visible text. */
export function normalizedText(el: Element | null): string {
  return squash(el?.textContent)
}

const capped = (text: string): string | null => (text && text.length <= NAME_MAX ? text : null)

function inputType(el: Element): string {
  return (el.getAttribute('type') ?? 'text').toLowerCase()
}

export function implicitRole(el: Element): string | null {
  const tag = el.tagName.toLowerCase()
  if (tag === 'button') return 'button'
  if (tag === 'a') return el.hasAttribute('href') ? 'link' : null
  if (tag === 'textarea') return 'textbox'
  if (tag === 'select') return 'combobox'
  if (/^h[1-6]$/.test(tag)) return 'heading'
  if (tag === 'input') {
    const type = inputType(el)
    if (BUTTON_INPUT_TYPES.includes(type) || type === 'image') return 'button'
    if (type === 'checkbox' || type === 'radio') return type
    // file, range, date, color and the like are not typed into
    return TEXT_INPUT_TYPES.includes(type) ? 'textbox' : null
  }
  return null
}

const isFormControl = (el: Element): boolean => ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)

// A wrapping label's own words, without the text of the control(s) inside it.
function ownLabelText(label: Element): string {
  const copy = label.cloneNode(true) as Element
  copy.querySelectorAll('input, textarea, select, button').forEach((c) => c.remove())
  return normalizedText(copy)
}

function forLabel(el: Element): string {
  if (!el.id) return ''
  const label = Array.from(el.ownerDocument.querySelectorAll('label')).find(
    (l) => l.getAttribute('for') === el.id
  )
  return label ? normalizedText(label) : ''
}

function wrappingLabel(el: Element): string {
  const label = el.parentElement?.closest('label')
  return label ? ownLabelText(label) : ''
}

/** The text of the label naming a form control, via label[for] or a wrapping label. */
export function labelText(el: Element): string | null {
  if (!isFormControl(el)) return null
  return capped(forLabel(el) || wrappingLabel(el))
}

function labelledBy(el: Element): string {
  const ids = (el.getAttribute('aria-labelledby') ?? '').split(/\s+/).filter(Boolean)
  return ids
    .map((id) => normalizedText(el.ownerDocument.getElementById(id)))
    .filter(Boolean)
    .join(' ')
}

/** The element's role: its explicit role attribute, else its implicit one. */
export function roleOf(el: Element): string | null {
  const explicit = (el.getAttribute('role') ?? '').trim().split(/\s+/)[0]
  return explicit || implicitRole(el)
}

/** Where a name came from: visible content (or a button's value), aria-label, or elsewhere. */
export type NameSource = 'content' | 'aria-label' | 'other'

/** First non-empty of the spec's name sources and which it was; null when empty or over the cap. */
export function accessibleNameSource(el: Element): { name: string; from: NameSource } | null {
  const role = roleOf(el)
  const isInput = el.tagName === 'INPUT'
  const sources: Array<[NameSource, () => string]> = [
    ['aria-label', () => squash(el.getAttribute('aria-label'))],
    ['other', () => labelledBy(el)],
    ['other', () => (isFormControl(el) ? forLabel(el) : '')],
    ['other', () => (isFormControl(el) ? wrappingLabel(el) : '')],
    [
      'content',
      () =>
        isInput && BUTTON_INPUT_TYPES.includes(inputType(el))
          ? squash(el.getAttribute('value'))
          : ''
    ],
    ['other', () => (isInput && inputType(el) === 'image' ? squash(el.getAttribute('alt')) : '')],
    ['content', () => (role && NAMED_BY_CONTENT.includes(role) ? normalizedText(el) : '')],
    ['other', () => squash(el.getAttribute('placeholder'))]
  ]
  for (const [from, source] of sources) {
    const name = source()
    if (name) return capped(name) ? { name, from } : null
  }
  return null
}

export function accessibleName(el: Element): string | null {
  return accessibleNameSource(el)?.name ?? null
}

/** Ids and classes a framework minted at runtime, which change between builds or loads. */
export function looksGenerated(id: string): boolean {
  return (
    /\d{4,}/.test(id) ||
    /[0-9a-f]{8,}/i.test(id) ||
    id.startsWith(':') ||
    /^(ember|ext-gen|react-|mui-|radix-)/.test(id)
  )
}
