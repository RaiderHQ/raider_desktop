import type { ElementTarget, Locator, Step } from '../../shared/types/step'
import { rubyString } from './ruby'
import { isValidSecretName } from '../../shared/secretSteps'
import { englishText } from '../../shared/describeStepEnglish'

// Ruby for recorded steps on the ruby_raider 4.0 runtime: plain Selenium calls
// (find_element, click, send_keys, clear) whose waiting and actionability the
// runtime adds, and the runtime's retrying matchers for every check. Nothing
// here renders for an older gem: a project below 4.0 is not recordable.

const KEY_SYMBOLS: Record<string, string> = {
  Enter: 'enter',
  Escape: 'escape',
  Tab: 'tab',
  Backspace: 'backspace',
  Delete: 'delete',
  Home: 'home',
  End: 'end',
  PageUp: 'page_up',
  PageDown: 'page_down',
  ArrowUp: 'arrow_up',
  ArrowDown: 'arrow_down',
  ArrowLeft: 'arrow_left',
  ArrowRight: 'arrow_right',
  ' ': 'space'
}

const keyArg = (key: string): string =>
  Object.hasOwn(KEY_SYMBOLS, key) ? `:${KEY_SYMBOLS[key]}` : rubyString(key)

// A value with the runtime's exact-match option. The recorder proves a role name, label
// or text unique by exact comparison, so the test asks for exactly that: the runtime's
// default is a substring match, and strict mode would refuse 'Login' on a page that
// also shows 'Login or register'.
const exact = (value: string): string => `[${rubyString(value)}, { exact: true }]`

import { DEFAULT_TEST_ID_ATTRIBUTE } from '../../shared/testIdAttribute'

export { DEFAULT_TEST_ID_ATTRIBUTE }

/**
 * The locator argument of find_element, from the semantic locator when the recorder captured
 * one. `testIdAttribute` is the project's `test_id_attribute`: the runtime resolves `test_id:`
 * through that key only, so a test id recorded under any other attribute (the recorder accepts
 * every unknown name in the selector priority as one) keeps its CSS form.
 */
export function locatorArg(el: ElementTarget, testIdAttribute = DEFAULT_TEST_ID_ATTRIBUTE): string {
  const semantic: Locator | undefined = el.locator
  if (!semantic) return `${el.strategy}: ${rubyString(el.value)}`
  switch (semantic.by) {
    case 'role':
      return `by_role(${rubyString(semantic.role)}, name: ${rubyString(semantic.name)}, exact: true)`
    case 'label':
      return `label: ${exact(semantic.text)}`
    case 'text':
      return `text: ${exact(semantic.text)}`
    case 'testId':
      return semantic.attribute === testIdAttribute
        ? `test_id: ${rubyString(semantic.value)}`
        : `${el.strategy}: ${rubyString(el.value)}`
    case 'id':
      return `id: ${rubyString(semantic.value)}`
    case 'css':
      return `css: ${rubyString(semantic.value)}`
    case 'xpath':
      return `xpath: ${rubyString(semantic.value)}`
  }
}

/**
 * 'ivar' reads the standalone-file instance variable (@driver);
 * 'helper' reads the project's spec_helper method (driver).
 */
export type Receiver = 'ivar' | 'helper'
export interface RenderOptions {
  receiver?: Receiver
  /** The project's test_id_attribute (config.yml); data-testid when absent */
  testIdAttribute?: string
}

function need<T>(value: T | undefined, what: string, check: string): T {
  if (value === undefined) throw new Error(`Invalid assert step: '${check}' requires ${what}`)
  return value
}

// Element matchers take the find in a block: the runtime re-finds the element on every
// poll, and a check that the element is gone (be_hidden) passes once find_element
// raises, where the plain form would wait for the element and fail at the deadline
const check = (find: string, matcher: string): string => `expect { ${find} }.to ${matcher}`

function renderAssert(
  step: Extract<Step, { kind: 'assert' }>,
  driver: string,
  testIdAttribute: string
): string {
  const kind = step.check
  const expected = (): string => rubyString(need(step.expected, 'an expected string', kind))
  if (kind === 'titleEquals') return `expect(${driver}).to have_title(${expected()})`
  // have_url compares the whole URL, so a part of it goes through the retrying block form
  if (kind === 'urlIncludes') return `expect { ${driver}.current_url }.to include(${expected()})`
  const find = `${driver}.find_element(${locatorArg(need(step.element, 'an element', kind), testIdAttribute)})`
  switch (kind) {
    case 'displayed':
      return check(find, 'be_visible')
    case 'notDisplayed':
      return check(find, 'be_hidden')
    case 'enabled':
      return check(find, 'be_enabled')
    case 'checked':
      return check(find, 'be_checked')
    case 'textEquals':
      return check(find, `have_text(${expected()}, exact: true)`)
    case 'textIncludes':
      return check(find, `have_text(${expected()})`)
    case 'valueEquals':
      return check(find, `have_value(${expected()})`)
  }
}

// A generated test only ever reads RAIDER_SECRET_ variables (see SECRET_NAME)
function secretVariable(step: Extract<Step, { kind: 'type' }>): string {
  const name = step.secretName
  if (name === undefined) throw new Error(englishText('recorder.step.secretUnnamed'))
  if (!isValidSecretName(name))
    throw new Error(englishText('recorder.step.secretNameRefused', { name }))
  return name
}

const WAIT_MATCHERS = { visible: 'be_visible', hidden: 'be_hidden', enabled: 'be_enabled' }

/** Ruby for one step: one or more lines, no trailing newline, no indentation. */
export function renderStep(step: Step, opts: RenderOptions = {}): string {
  const driver = opts.receiver === 'helper' ? 'driver' : '@driver'
  const testIdAttribute = opts.testIdAttribute ?? DEFAULT_TEST_ID_ATTRIBUTE
  const find = (el: ElementTarget): string =>
    `${driver}.find_element(${locatorArg(el, testIdAttribute)})`
  switch (step.kind) {
    case 'navigate':
      return `${driver}.navigate.to(${rubyString(step.url)})`
    case 'click':
      return `${find(step.element)}.click`
    case 'type': {
      // A secret's value is never in the step; the test reads it when it runs
      const text = step.secret
        ? `ENV.fetch(${rubyString(secretVariable(step))})`
        : rubyString(step.text)
      return `${find(step.element)}.clear\n${find(step.element)}.send_keys(${text})`
    }
    case 'pressKey':
      return `${find(step.element)}.send_keys(${keyArg(step.key)})`
    case 'wait':
      return check(find(step.element), WAIT_MATCHERS[step.until])
    case 'assert':
      return renderAssert(step, driver, testIdAttribute)
    case 'switchFrame':
      return step.element
        ? `${driver}.switch_to.frame(${find(step.element)})`
        : `${driver}.switch_to.default_content`
    case 'custom':
      return step.code
  }
}
