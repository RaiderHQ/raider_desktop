import { isWeakLocator } from './types/step'
import type { AssertKind, ElementTarget, Step } from './types/step'
import { secretNameOf } from './secretSteps'
import { looksGenerated } from './looksGenerated'

/** An i18n key plus its interpolation values; the friendly view never shows Ruby. */
export interface StepDescription {
  key: string
  values: Record<string, string>
}

const P = 'recorder.commandParser'

const ELEMENT_ASSERT_KEYS: Record<Exclude<AssertKind, 'titleEquals' | 'urlIncludes'>, string> = {
  displayed: 'assertElementDisplayed',
  notDisplayed: 'assertElementNotDisplayed',
  enabled: 'assertElementEnabled',
  checked: 'assertElementChecked',
  textEquals: 'assertElementTextEquals',
  textIncludes: 'assertElementTextIncludes',
  valueEquals: 'assertElementValue'
}

const WAIT_KEYS = {
  visible: 'waitForElementDisplayed',
  hidden: 'waitForElementDisappear',
  enabled: 'waitForElementEnabled'
}

/** Matches `recorder.step.thisElement` in en.json; values are interpolated, so it can't be a key. */
export const THIS_ELEMENT = 'this element'

/** The element's human label, else the human part of its locator, else "this element". */
export const elementName = (el: ElementTarget | undefined): string => {
  if (!el) return ''
  if (el.label) return el.label
  const l = el.locator
  if (l?.by === 'role') return l.name
  if (l?.by === 'label' || l?.by === 'text') return l.text
  if (l?.by === 'testId') return l.value
  return THIS_ELEMENT
}

const ROLE_WORDS: Record<string, string> = {
  button: 'button',
  link: 'link',
  textbox: 'text box',
  checkbox: 'checkbox',
  radio: 'radio button',
  combobox: 'dropdown',
  heading: 'heading'
}

const F = 'recorder.foundBy'

export interface FoundBy {
  key: string
  values: Record<string, string>
  weak: boolean
}

// An older css value that is one attribute or a stable id holds up as well as a fresh pick.
const ATTRIBUTE_CSS = /^\[[\w-]+="[^"]*"\]$/
const ID_CSS = /^#([\w-]+)$/
const isSturdyCss = (value: string): boolean => {
  const id = ID_CSS.exec(value)?.[1]
  return ATTRIBUTE_CSS.test(value) || (id !== undefined && !looksGenerated(id))
}

/** How the recorder found an element, in plain words; null when there is nothing to say. */
export function foundBy(el?: ElementTarget): FoundBy | null {
  if (!el) return null
  const l = el.locator
  if (!l) {
    // An older recording: only strategy/value, so say how it was found and flag the fragile ones.
    if (el.strategy === 'css') {
      return { key: `${F}.cssOlder`, values: {}, weak: !isSturdyCss(el.value) }
    }
    if (el.strategy === 'xpath') return { key: `${F}.xpathOlder`, values: {}, weak: true }
    if (el.strategy === 'id') return { key: `${F}.id`, values: {}, weak: false }
    return null
  }
  const weak = isWeakLocator(l)
  switch (l.by) {
    case 'role':
      return {
        key: `${F}.role`,
        values: { role: ROLE_WORDS[l.role] ?? l.role, name: l.name },
        weak
      }
    case 'label':
      return { key: `${F}.label`, values: { text: l.text }, weak }
    case 'testId':
      return { key: `${F}.testId`, values: { value: l.value }, weak }
    case 'text':
      return { key: `${F}.text`, values: { text: l.text }, weak }
    case 'id':
      return { key: `${F}.id`, values: {}, weak }
    case 'css':
      return { key: `${F}.css`, values: {}, weak }
    case 'xpath':
      return { key: `${F}.xpath`, values: {}, weak }
  }
}

const keyName = (key: string): string => (key === ' ' ? 'Space' : key)

export function describeStep(step: Step): StepDescription {
  switch (step.kind) {
    case 'navigate':
      return { key: `${P}.visit`, values: { url: step.url } }
    case 'click':
      return { key: `${P}.clickElement`, values: { element: elementName(step.element) } }
    case 'type':
      if (step.secret) {
        return {
          key: `${P}.typeSecret`,
          values: {
            element: elementName(step.element),
            name: secretNameOf(step)
          }
        }
      }
      return {
        key: `${P}.typeText`,
        values: { element: elementName(step.element), text: step.text }
      }
    case 'pressKey':
      return {
        key: `${P}.pressKey`,
        values: { element: elementName(step.element), key: keyName(step.key) }
      }
    case 'wait':
      return {
        key: `${P}.${WAIT_KEYS[step.until]}`,
        values: { element: elementName(step.element) }
      }
    case 'assert':
      if (step.check === 'titleEquals') {
        return { key: `${P}.assertPageTitle`, values: { title: step.expected ?? '' } }
      }
      if (step.check === 'urlIncludes') {
        return { key: `${P}.assertUrlContains`, values: { url: step.expected ?? '' } }
      }
      return {
        key: `${P}.${ELEMENT_ASSERT_KEYS[step.check]}`,
        values:
          step.expected === undefined
            ? { element: elementName(step.element) }
            : { element: elementName(step.element), text: step.expected }
      }
    case 'switchFrame':
      return step.element
        ? { key: `${P}.switchToFrame`, values: { element: elementName(step.element) } }
        : { key: `${P}.switchToDefaultContent`, values: {} }
    case 'custom':
      return { key: 'recorder.step.custom', values: {} }
    default:
      // A kind this build doesn't know (e.g. from a newer file): describe it generically
      return { key: 'recorder.step.custom', values: {} }
  }
}
