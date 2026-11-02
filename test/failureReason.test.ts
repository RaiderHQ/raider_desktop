import { describe, it, expect } from 'vitest'
import { failureReason } from '@shared/failureReason'
import { elementName } from '@shared/describeStep'
import type { Step } from '@shared/types/step'
import en from '../src/renderer/src/assets/translations/en.json'

const click: Step = {
  id: 'c',
  kind: 'click',
  element: { strategy: 'css', value: '#save', label: 'Save' }
}
const bare: Step = { id: 'b', kind: 'click', element: { strategy: 'css', value: '#btn-x' } }
const assertText: Step = {
  id: 'a',
  kind: 'assert',
  check: 'textEquals',
  element: { strategy: 'css', value: '#save', label: 'Save' },
  expected: 'Welcome'
}
const nav: Step = { id: 'n', kind: 'navigate', url: 'https://shop.test' }

const el = (s: Step): string => elementName('element' in s ? s.element : undefined)
const reason = (exceptionClass: string | undefined, message: string, step: Step) =>
  failureReason({ exceptionClass, message }, step, el(step))

const R = 'failedStep.reason.'

describe('failureReason', () => {
  it('maps NoSuchElementError to notFound', () => {
    expect(reason('Selenium::WebDriver::Error::NoSuchElementError', 'x', click)).toEqual({
      key: `${R}notFound`,
      params: { element: '"Save"' }
    })
  })

  it('maps "Unable to locate" to notFound without leaking the selector', () => {
    const r = reason(
      'RuntimeError',
      'Unable to locate element: {"method":"css selector","selector":"#btn-x"}',
      bare
    )
    expect(r.key).toBe(`${R}notFound`)
    expect(r.params.element).toBe('this element')
    expect(JSON.stringify(r)).not.toContain('#btn-x')
  })

  it('maps UnknownObjectException to notFound', () => {
    expect(reason('Watir::Exception::UnknownObjectException', 'x', click).key).toBe(`${R}notFound`)
  })

  describe('wait helper', () => {
    const wait = (state: string | null) =>
      reason(
        'WaitHelper::TimeoutError',
        `Waited 10s for element to be clickable${state === null ? '' : `; last seen: ${state}`}`,
        click
      ).key
    it.each([
      ['not found', 'notFound'],
      ['present but not visible', 'hidden'],
      ['visible but disabled', 'disabled'],
      ['click intercepted: <div class="modal">', 'covered'],
      ['not interactable: element has zero size', 'unusable'],
      ['something new', 'unusable']
    ])('last seen %s', (state, key) => {
      expect(wait(state)).toBe(`${R}${key}`)
    })
    it('no state is unusable', () => {
      expect(wait(null)).toBe(`${R}unusable`)
    })
    it.each([
      ['stale element', 'stale'],
      ['still moving', 'stale'],
      ['drop target not found', 'notFound'],
      ['not found after 3 scrolls', 'notFound']
    ])('last seen %s', (state, key) => {
      expect(wait(state)).toBe(`${R}${key}`)
    })
    it('stale from the wait helper opens with a capital', () => {
      expect(
        reason('WaitHelper::TimeoutError', 'Waited 1s for x; last seen: stale element', bare)
      ).toMatchObject({ key: `${R}stale`, params: { element: 'This element' } })
    })
    it('handles the gem message format, with and without the eventually prefix', () => {
      const msg = 'Waited 10s for {id: "x"} to be visible and enabled; last seen: not found'
      expect(reason('WaitHelper::TimeoutError', msg, click).key).toBe(`${R}notFound`)
      expect(
        reason('WaitHelper::TimeoutError', `(still failing after 3s)\n${msg}`, click).key
      ).toBe(`${R}notFound`)
    })
    it('recognises the message when the class is generic', () => {
      expect(reason('RuntimeError', 'Waited 2.5s for x; last seen: not found', click).key).toBe(
        `${R}notFound`
      )
    })
  })

  it('maps a plain TimeoutError on a click to timedOut, but not on an assert', () => {
    const cls = 'Selenium::WebDriver::Error::TimeoutError'
    expect(reason(cls, 'timed out', click)).toEqual({
      key: `${R}timedOut`,
      params: { element: '"Save"' }
    })
    expect(reason(cls, 'timed out', assertText)).toEqual({ key: `${R}generic`, params: {} })
  })

  it.each([
    'Selenium::WebDriver::Error::ElementNotInteractableError',
    'Selenium::WebDriver::Error::ElementClickInterceptedError',
    'Watir::Exception::ObjectDisabledException'
  ])('maps %s to notInteractable', (cls) => {
    expect(reason(cls, 'x', click).key).toBe(`${R}notInteractable`)
  })

  it('opens the stale sentence with a capital', () => {
    expect(reason('Selenium::WebDriver::Error::StaleElementReferenceError', 'x', bare)).toEqual({
      key: `${R}stale`,
      params: { element: 'This element' }
    })
  })

  describe('expectations', () => {
    const cls = 'RSpec::Expectations::ExpectationNotMetError'
    const expected = {
      key: `${R}expected`,
      params: { expected: '"Welcome"', actual: '"Hello"' },
      actualValue: 'Hello'
    }
    const msg = 'expected: "Welcome"\n     got: "Hello"\n\n(compared using ==)\n'
    it('parses expected and got', () => {
      expect(reason(cls, msg, assertText)).toEqual(expected)
    })
    it('strips the eventually prefix', () => {
      expect(reason(cls, `(still failing after 5s)\n${msg}`, assertText)).toEqual(expected)
      expect(reason(cls, `(still failing after 2.5s)\n${msg}`, assertText)).toEqual(expected)
    })
    it('parses the include form', () => {
      expect(reason(cls, 'expected "Hello world" to include "Welcome"', assertText)).toEqual({
        key: `${R}expected`,
        params: { expected: '"Welcome"', actual: '"Hello world"' },
        actualValue: 'Hello world'
      })
    })
    it('unescapes the actual value', () => {
      const r = reason(cls, 'expected: "a"\n got: "say \\"hi\\" \\\\ now"', assertText)
      expect(r.actualValue).toBe('say "hi" \\ now')
    })
    it('uses the check fallback when the expected side is not a quoted string', () => {
      expect(reason(cls, 'expected: 3\n got: 4', assertText).key).toBe(`${R}checkFailed`)
      expect(reason(cls, 'expected: truthy value\n got: false', assertText).key).toBe(
        `${R}checkFailed`
      )
    })
    it('leaves actualValue unset for other escapes', () => {
      const r = reason(cls, 'expected: "a"\n got: "line\\nbreak"', assertText)
      expect(r.params.actual).toBe('"line\\nbreak"')
      expect(r).not.toHaveProperty('actualValue')
    })
    it('truncates long printed values to 80 characters', () => {
      const long = `"${'x'.repeat(200)}"`
      const r = reason(cls, `expected: "a"\n got: ${long}`, assertText)
      expect(r.params.actual).toHaveLength(80)
      expect(r.params.actual.endsWith('…')).toBe(true)
    })
    it('does not call an assert with "Unable to locate" in its text notFound', () => {
      const r = reason(cls, 'expected: "ok"\n got: "Unable to locate your order"', assertText)
      expect(r.key).toBe(`${R}expected`)
    })
    it('falls back to checkFailed when nothing parses', () => {
      expect(reason(cls, 'expected true, got false', assertText)).toEqual({
        key: `${R}checkFailed`,
        params: { element: '"Save"' }
      })
    })
  })

  it('maps a refused connection on navigate to cantOpen', () => {
    expect(reason('Errno::ECONNREFUSED', 'Connection refused', nav)).toEqual({
      key: `${R}cantOpen`,
      params: { url: 'https://shop.test' }
    })
  })

  it('falls back to generic', () => {
    expect(reason('ArgumentError', 'wrong number of arguments', click)).toEqual({
      key: `${R}generic`,
      params: {}
    })
  })
})

describe('en.json failedStep.reason', () => {
  it('has every reason key', () => {
    const reasons = (en as unknown as { failedStep: { reason: Record<string, string> } }).failedStep
      .reason
    for (const k of [
      'notFound',
      'hidden',
      'disabled',
      'covered',
      'unusable',
      'timedOut',
      'notInteractable',
      'stale',
      'expected',
      'checkFailed',
      'cantOpen',
      'generic'
    ]) {
      expect(reasons[k], k).toBeTruthy()
    }
  })
})
