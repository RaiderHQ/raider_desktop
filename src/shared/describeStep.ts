import type { AssertKind, ElementTarget, Step } from './types/step'

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

/** The element's human label when it has one, else `strategy=value`. */
const elementName = (el: ElementTarget | undefined): string =>
  !el ? '' : el.label || `${el.strategy}=${el.value}`

const keyName = (key: string): string => (key === ' ' ? 'Space' : key)

export function describeStep(step: Step): StepDescription {
  switch (step.kind) {
    case 'navigate':
      return { key: `${P}.visit`, values: { url: step.url } }
    case 'click':
      return { key: `${P}.clickElement`, values: { element: elementName(step.element) } }
    case 'type':
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
