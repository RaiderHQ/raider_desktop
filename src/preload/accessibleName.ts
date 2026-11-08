// Names and roles as a user perceives them, approximated without layout so it
// behaves the same in a real page and in jsdom.

export const NAME_MAX = 80

// Input types typed into as text; a missing type is a text field. Shared with the
// selector builders, which spell the same list in XPath.
import { TEXT_INPUT_TYPES } from '../shared/locatorSelectors'
export { TEXT_INPUT_TYPES }
const BUTTON_INPUT_TYPES = ['button', 'submit', 'reset']
const NAMED_BY_CONTENT = ['button', 'link', 'heading']

const squash = (text: string | null | undefined): string => (text ?? '').replace(/\s+/g, ' ').trim()

/** Collapses whitespace runs; layout-free stand-in for visible text. */
export function normalizedText(el: Element | null): string {
  return squash(el?.textContent)
}

// Subtrees the role engine leaves out of a name: aria-hidden, the hidden attribute, a hidden
// input, and tags the UA stylesheet hides. Judged by attribute and tag only, so no layout.
const HIDDEN_TAGS = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT'])
const hiddenFromName = (el: Element): boolean =>
  el.getAttribute('aria-hidden') === 'true' ||
  el.hasAttribute('hidden') ||
  HIDDEN_TAGS.has(el.tagName) ||
  (el.tagName === 'INPUT' && inputType(el) === 'hidden')

// Raw, so the spaces at the edges of a child's text still separate it from its neighbours
function rawVisibleText(el: Element): string {
  let out = ''
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.nodeValue ?? ''
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const child = node as Element
      if (hiddenFromName(child)) continue
      const label = squash(child.getAttribute('aria-label'))
      if (label) out += label
      else if (child.tagName === 'IMG') out += child.getAttribute('alt') ?? ''
      else out += rawVisibleText(child)
    }
  }
  return out
}

/**
 * The text the role engine's name-from-content walk sees: text nodes in document order, an
 * image's alt or a descendant's own aria-label standing in for its subtree, skipping subtrees
 * hidden by aria-hidden="true" or the hidden attribute. Unlike normalizedText (the runtime's
 * `text:` key is normalize-space(.), hidden text and all) this is for role names only.
 */
export function visibleText(el: Element): string {
  return squash(rawVisibleText(el))
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
  return visibleText(copy)
}

function forLabel(el: Element): string {
  if (!el.id) return ''
  const label = Array.from(el.ownerDocument.querySelectorAll('label')).find(
    (l) => l.getAttribute('for') === el.id
  )
  return label ? visibleText(label) : ''
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
    .map((id) => {
      const target = el.ownerDocument.getElementById(id)
      return target ? visibleText(target) : ''
    })
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

/**
 * First non-empty of the role engine's name sources, in its order, and which it was; null
 * when empty or over the cap. aria-labelledby comes before aria-label; a button input's value
 * and an image input's alt come before its labels; content is the engine's visible walk.
 */
export function accessibleNameSource(el: Element): { name: string; from: NameSource } | null {
  const role = roleOf(el)
  const isInput = el.tagName === 'INPUT'
  const sources: Array<[NameSource, () => string]> = [
    ['other', () => labelledBy(el)],
    ['aria-label', () => squash(el.getAttribute('aria-label'))],
    [
      'content',
      () =>
        isInput && BUTTON_INPUT_TYPES.includes(inputType(el))
          ? squash(el.getAttribute('value'))
          : ''
    ],
    ['other', () => (isInput && inputType(el) === 'image' ? squash(el.getAttribute('alt')) : '')],
    ['other', () => (isFormControl(el) ? forLabel(el) : '')],
    ['other', () => (isFormControl(el) ? wrappingLabel(el) : '')],
    ['content', () => (role && NAMED_BY_CONTENT.includes(role) ? visibleText(el) : '')],
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

// Shared so the step list can judge older recordings the same way
export { looksGenerated } from '../shared/looksGenerated'
