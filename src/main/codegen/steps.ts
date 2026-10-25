import type { ElementTarget, Step } from '../../shared/types/step'
import { rubyString } from './ruby'

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
const sel = (el: ElementTarget): string => `@driver.find_element(${locator(el)})`
const sels = (el: ElementTarget): string => `@driver.find_elements(${locator(el)})`
const wat = (el: ElementTarget): string => `@browser.element(${locator(el)})`

function need<T>(value: T | undefined, what: string, check: string): T {
  if (value === undefined) throw new Error(`Invalid assert step: '${check}' requires ${what}`)
  return value
}

function renderAssert(step: Extract<Step, { kind: 'assert' }>, automation: Automation): string {
  const { check } = step
  const selenium = automation === 'selenium'
  if (check === 'titleEquals' || check === 'urlIncludes') {
    const expected = rubyString(need(step.expected, 'an expected string', check))
    const subject = check === 'titleEquals' ? 'title' : selenium ? 'current_url' : 'url'
    const matcher = check === 'titleEquals' ? 'eq' : 'include'
    return `expect(${selenium ? '@driver' : '@browser'}.${subject}).to ${matcher}(${expected})`
  }
  const el = need(step.element, 'an element', check)
  const target = selenium ? sel(el) : wat(el)
  switch (check) {
    case 'displayed':
      return `expect(${target}).to ${selenium ? 'be_displayed' : 'be_present'}`
    case 'notDisplayed':
      return selenium
        ? `expect(${sels(el)}.none?(&:displayed?)).to be(true)`
        : `expect(${target}).not_to be_present`
    case 'enabled':
      return `expect(${target}).to be_enabled`
    case 'checked':
      return selenium
        ? `expect(${target}).to be_selected`
        : `expect(${target}.to_subtype).to be_set`
    case 'textEquals':
    case 'textIncludes': {
      const expected = rubyString(need(step.expected, 'an expected string', check))
      return `expect(${target}.text).to ${check === 'textEquals' ? 'eq' : 'include'}(${expected})`
    }
    case 'valueEquals': {
      const expected = rubyString(need(step.expected, 'an expected string', check))
      const read = selenium ? `.attribute('value')` : '.to_subtype.value'
      return `expect(${target}${read}).to eq(${expected})`
    }
  }
}

/** Ruby for one step: one or more lines, no trailing newline, no indentation. */
export function renderStep(step: Step, automation: Automation): string {
  const selenium = automation === 'selenium'
  switch (step.kind) {
    case 'navigate':
      return selenium
        ? `@driver.navigate.to(${rubyString(step.url)})`
        : `@browser.goto(${rubyString(step.url)})`
    case 'click':
      return selenium
        ? `@wait.until { ${sel(step.element)}.displayed? }\n${sel(step.element)}.click`
        : `${wat(step.element)}.click`
    case 'type': {
      const text = rubyString(step.text)
      return selenium
        ? [
            `@wait.until { ${sel(step.element)}.displayed? }`,
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
          return `@wait.until { ${sels(step.element)}.none?(&:displayed?) }`
        return `@wait.until { ${sel(step.element)}.${step.until === 'visible' ? 'displayed?' : 'enabled?'} }`
      }
      if (step.until === 'hidden') return `${wat(step.element)}.wait_while(&:present?)`
      return `${wat(step.element)}.wait_until(&:${step.until === 'visible' ? 'present?' : 'enabled?'})`
    case 'assert':
      return renderAssert(step, automation)
    case 'switchFrame':
      if (selenium) {
        return step.element
          ? `@driver.switch_to.frame(${sel(step.element)})`
          : '@driver.switch_to.default_content'
      }
      return step.element
        ? `# Watir iframe objects scope only their own calls, so switch the underlying driver\n@browser.wd.switch_to.frame(${wat(step.element)}.wd)`
        : '@browser.wd.switch_to.default_content'
    case 'custom':
      return step.code
  }
}
