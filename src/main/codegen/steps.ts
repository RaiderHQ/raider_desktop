import type { ElementTarget, Locator, Step } from '../../shared/types/step'
import { rubyString } from './ruby'
import { isValidSecretName } from '../../shared/secretSteps'
import { englishText } from '../../shared/describeStepEnglish'

export type Automation = 'selenium' | 'watir'

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

const locator = (el: ElementTarget): string => `${el.strategy}: ${rubyString(el.value)}`

// Watir element types whose role tells us the tag; the rest stay a generic element
const WATIR_TYPED_ROLES: Record<string, string> = {
  textbox: 'text_field',
  checkbox: 'checkbox',
  radio: 'radio',
  combobox: 'select_list'
}

// Native Watir form for a semantic locator, or undefined to fall back to the XPath
function nativeWatir(l: Locator, browser: string): string | undefined {
  switch (l.by) {
    case 'role': {
      const name = rubyString(l.name)
      if (l.role === 'button' || l.role === 'link') {
        if (l.nameFrom === 'content') return `${browser}.${l.role}(text: ${name})`
        if (l.nameFrom === 'aria-label') return `${browser}.${l.role}(aria_label: ${name})`
        return undefined
      }
      // A <label> name is recorded as 'other', so label: can't be used; only aria-label is certain
      const type = WATIR_TYPED_ROLES[l.role]
      return type !== undefined && l.nameFrom === 'aria-label'
        ? `${browser}.${type}(aria_label: ${name})`
        : undefined
    }
    case 'testId':
      return `${browser}.element(${l.attribute.replace(/-/g, '_')}: ${rubyString(l.value)})`
    case 'text':
      return `${browser}.element(visible_text: ${rubyString(l.text)})`
    default:
      return undefined
  }
}

/** Watir finder for an element: native methods for stable picks, else strategy/value. */
export function watirElement(el: ElementTarget, browser: string): string {
  const native = el.locator && nativeWatir(el.locator, browser)
  return native ?? `${browser}.element(${locator(el)})`
}

/**
 * 'ivar' reads the standalone-file instance variables (@driver, @wait, @browser);
 * 'helper' reads the project's spec_helper methods (driver, wait, browser).
 */
export type Receiver = 'ivar' | 'helper'
export interface RenderOptions {
  receiver?: Receiver
}

interface Names {
  driver: string
  wait: string
  browser: string
  sel: (el: ElementTarget) => string
  sels: (el: ElementTarget) => string
  wat: (el: ElementTarget) => string
}

function namesFor(receiver: Receiver): Names {
  const p = receiver === 'helper' ? '' : '@'
  const driver = `${p}driver`
  const browser = `${p}browser`
  return {
    driver,
    wait: `${p}wait`,
    browser,
    sel: (el) => `${driver}.find_element(${locator(el)})`,
    sels: (el) => `${driver}.find_elements(${locator(el)})`,
    wat: (el) => watirElement(el, browser)
  }
}

function need<T>(value: T | undefined, what: string, check: string): T {
  if (value === undefined) throw new Error(`Invalid assert step: '${check}' requires ${what}`)
  return value
}

// Each check first waits (up to the explicit wait) for its condition, then asserts it,
// so content that renders late passes on Run just as it does in in-app replay
function renderAssert(
  step: Extract<Step, { kind: 'assert' }>,
  automation: Automation,
  n: Names
): string {
  const { check } = step
  const { sel, sels, wat } = n
  const selenium = automation === 'selenium'
  // Selenium waits on @wait with a plain condition; Watir waits on the element (or browser) itself
  const lines = (condition: string, assertion: string): string =>
    `${selenium ? `${n.wait}.until { ${condition} }` : condition}\n${assertion}`

  if (check === 'titleEquals' || check === 'urlIncludes') {
    const expected = rubyString(need(step.expected, 'an expected string', check))
    const title = check === 'titleEquals'
    const subject = title ? 'title' : selenium ? 'current_url' : 'url'
    const matches = title ? ` == ${expected}` : `.include?(${expected})`
    const matcher = title ? 'eq' : 'include'
    return selenium
      ? lines(
          `${n.driver}.${subject}${matches}`,
          `expect(${n.driver}.${subject}).to ${matcher}(${expected})`
        )
      : lines(
          `${n.browser}.wait_until { |b| b.${subject}${matches} }`,
          `expect(${n.browser}.${subject}).to ${matcher}(${expected})`
        )
  }
  const el = need(step.element, 'an element', check)
  const target = selenium ? sel(el) : wat(el)
  switch (check) {
    case 'displayed':
      return selenium
        ? lines(`${target}.displayed?`, `expect(${target}).to be_displayed`)
        : lines(`${target}.wait_until(&:present?)`, `expect(${target}).to be_present`)
    case 'notDisplayed':
      return selenium
        ? lines(
            `${sels(el)}.none?(&:displayed?)`,
            `expect(${sels(el)}.none?(&:displayed?)).to be(true)`
          )
        : lines(`${target}.wait_while(&:present?)`, `expect(${target}).not_to be_present`)
    case 'enabled':
      return lines(
        selenium ? `${target}.enabled?` : `${target}.wait_until(&:enabled?)`,
        `expect(${target}).to be_enabled`
      )
    case 'checked':
      return selenium
        ? lines(`${target}.selected?`, `expect(${target}).to be_selected`)
        : lines(`${target}.to_subtype.wait_until(&:set?)`, `expect(${target}.to_subtype).to be_set`)
    case 'textEquals':
    case 'textIncludes': {
      const expected = rubyString(need(step.expected, 'an expected string', check))
      const equals = check === 'textEquals'
      const text = (subject: string): string =>
        equals ? `${subject}.text == ${expected}` : `${subject}.text.include?(${expected})`
      return lines(
        selenium ? text(target) : `${target}.wait_until { |el| ${text('el')} }`,
        `expect(${target}.text).to ${equals ? 'eq' : 'include'}(${expected})`
      )
    }
    case 'valueEquals': {
      const expected = rubyString(need(step.expected, 'an expected string', check))
      return selenium
        ? lines(
            `${target}.attribute('value') == ${expected}`,
            `expect(${target}.attribute('value')).to eq(${expected})`
          )
        : lines(
            `${target}.to_subtype.wait_until { |el| el.value == ${expected} }`,
            `expect(${target}.to_subtype.value).to eq(${expected})`
          )
    }
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

/** Ruby for one step: one or more lines, no trailing newline, no indentation. */
export function renderStep(step: Step, automation: Automation, opts: RenderOptions = {}): string {
  const selenium = automation === 'selenium'
  const n = namesFor(opts.receiver ?? 'ivar')
  const { sel, sels, wat } = n
  switch (step.kind) {
    case 'navigate':
      return selenium
        ? `${n.driver}.navigate.to(${rubyString(step.url)})`
        : `${n.browser}.goto(${rubyString(step.url)})`
    case 'click':
      return selenium
        ? `${n.wait}.until { ${sel(step.element)}.displayed? }\n${sel(step.element)}.click`
        : `${wat(step.element)}.click`
    case 'type': {
      // A secret's value is never in the step; the test reads it when it runs
      const text = step.secret
        ? `ENV.fetch(${rubyString(secretVariable(step))})`
        : rubyString(step.text)
      return selenium
        ? [
            `${n.wait}.until { ${sel(step.element)}.displayed? }`,
            `${sel(step.element)}.clear`,
            `${sel(step.element)}.send_keys(${text})`
          ].join('\n')
        : `${wat(step.element)}.to_subtype.set(${text})`
    }
    case 'pressKey':
      return `${selenium ? sel(step.element) : wat(step.element)}.send_keys(${keyArg(step.key)})`
    case 'wait':
      if (selenium) {
        if (step.until === 'hidden')
          return `${n.wait}.until { ${sels(step.element)}.none?(&:displayed?) }`
        return `${n.wait}.until { ${sel(step.element)}.${step.until === 'visible' ? 'displayed?' : 'enabled?'} }`
      }
      if (step.until === 'hidden') return `${wat(step.element)}.wait_while(&:present?)`
      return `${wat(step.element)}.wait_until(&:${step.until === 'visible' ? 'present?' : 'enabled?'})`
    case 'assert':
      return renderAssert(step, automation, n)
    case 'switchFrame':
      if (selenium) {
        return step.element
          ? `${n.driver}.switch_to.frame(${sel(step.element)})`
          : `${n.driver}.switch_to.default_content`
      }
      return step.element
        ? `# Watir iframe objects scope only their own calls, so switch the underlying driver\n${n.browser}.wd.switch_to.frame(${wat(step.element)}.wd)`
        : `${n.browser}.wd.switch_to.default_content`
    case 'custom':
      return step.code
  }
}
