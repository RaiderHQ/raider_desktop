import { describe, it, expect } from 'vitest'
import { describeTraceStep, plainUrl, traceFoundBy } from '../src/shared/trace/describeTraceStep'
import { THIS_ELEMENT } from '../src/shared/describeStep'
import { englishText } from '@shared/describeStepEnglish'
import type { RaiderTraceStep } from '../src/shared/types/raiderTrace'
import { fixtureIndex } from './helpers/traceFixture'

const stepAt = (n: number): RaiderTraceStep => fixtureIndex().steps.find((s) => s.index === n)!
const make = (over: Partial<RaiderTraceStep>): RaiderTraceStep => ({
  ...stepAt(6),
  ...over
})

describe('describeTraceStep', () => {
  it('describes the fixture steps', () => {
    expect(describeTraceStep(stepAt(1))).toEqual({
      key: 'traceViewer.step.navigate',
      values: { url: 'http://127.0.0.1:55539/' }
    })
    expect(describeTraceStep(stepAt(5))).toMatchObject({
      key: 'traceViewer.step.typeText',
      values: { text: 'plain-trace-name' },
      element: { values: { label: 'Name', role: 'text box' } }
    })
    expect(describeTraceStep(stepAt(6))).toMatchObject({
      key: 'traceViewer.step.click',
      element: { key: 'traceViewer.element.withRole', values: { label: 'Go', role: 'button' } }
    })
    expect(describeTraceStep(stepAt(4))).toMatchObject({
      key: 'traceViewer.step.findElement',
      element: { key: 'traceViewer.element.unnamed' }
    })
    expect(describeTraceStep(stepAt(8)).key).toBe('traceViewer.step.readText')
    expect(describeTraceStep(stepAt(7)).key).toBe('traceViewer.step.eventually')
    expect(describeTraceStep(stepAt(9)).key).toBe('traceViewer.step.eventuallyFailed')
  })

  it('never says a failed wait passed', () => {
    const failed = englishText(describeTraceStep(stepAt(9)).key)
    expect(failed).not.toMatch(/passed/i)
    expect(englishText(describeTraceStep(stepAt(7)).key)).toBe('Waited until the check passed')
    expect(describeTraceStep(make({ action: 'eventually', status: 'failed' })).key).toBe(
      'traceViewer.step.eventuallyFailed'
    )
  })

  it('never reveals a secret step', () => {
    for (const n of [2, 3]) {
      const result = describeTraceStep(stepAt(n))
      expect(result.key).toBe('traceViewer.step.typeSecret')
      const text = JSON.stringify(result)
      expect(text).not.toContain('send_keys')
      expect(text).not.toContain('pw')
    }
    expect(describeTraceStep(stepAt(2)).element).toEqual({
      key: 'traceViewer.element.withRole',
      values: { label: 'Password', role: 'text box' }
    })
    const result = describeTraceStep(make({ action: 'send_keys', value: 'hunter2', secret: true }))
    expect(result.key).toBe('traceViewer.step.typeSecret')
    expect(JSON.stringify(result)).not.toContain('hunter2')
  })

  it('describes a secret select without the value', () => {
    const result = describeTraceStep(make({ action: 'select_by', secret: true, value: null }))
    expect(result.key).toBe('traceViewer.step.selectSecret')
    expect(describeTraceStep(make({ action: 'select_by', value: 'Red' }))).toMatchObject({
      key: 'traceViewer.step.selectOption',
      values: { text: 'Red' }
    })
  })

  it('handles typing and choosing with no value', () => {
    expect(describeTraceStep(make({ action: 'send_keys', value: null })).key).toBe(
      'traceViewer.step.typeEmpty'
    )
    expect(describeTraceStep(make({ action: 'select_by', value: null })).key).toBe(
      'traceViewer.step.selectSecret'
    )
  })

  it('names the compared screenshot, and says when it did not match', () => {
    const base = { action: 'match_screenshot', name: 'home', locator: null }
    expect(describeTraceStep(make({ ...base, status: 'passed' }))).toEqual({
      key: 'traceViewer.step.matchScreenshot',
      values: { name: 'home' }
    })
    expect(describeTraceStep(make({ ...base, status: 'failed' }))).toEqual({
      key: 'traceViewer.step.matchScreenshotFailed',
      values: { name: 'home' }
    })
    expect(describeTraceStep(make({ ...base, name: undefined }))).toEqual({
      key: 'traceViewer.step.matchScreenshot',
      values: { name: '' }
    })
  })

  it('lets a failure win over the action, and falls back for unknown actions', () => {
    expect(describeTraceStep(make({ kind: 'failure' })).key).toBe('traceViewer.step.failure')
    expect(describeTraceStep(make({ action: 'tap' })).key).toBe('traceViewer.step.other')
  })

  it('names an element with a label but no known role', () => {
    expect(describeTraceStep(make({ element: { label: 'Menu', role: 'weird' } })).element).toEqual({
      key: 'traceViewer.element.named',
      values: { label: 'Menu' }
    })
  })

  it('never puts a selector or error text into the description', () => {
    const result = describeTraceStep(
      make({
        locator: { strategy: 'css', selector: '#secret-sel', within: [] },
        error: { className: 'Selenium::WebDriver::Error::NoSuchElementError', message: 'boom-msg' }
      })
    )
    const text = JSON.stringify(result)
    for (const leak of ['secret-sel', 'boom-msg', 'NoSuchElement']) expect(text).not.toContain(leak)
  })

  it('only produces keys that exist in en.json', () => {
    const actions = [
      'navigate',
      'click',
      'send_keys',
      'clear',
      'submit',
      'select_by',
      'hover',
      'drag_and_drop',
      'scroll_into_view',
      'text',
      'attribute',
      'displayed?',
      'enabled?',
      'selected?',
      'find_element',
      'find_elements',
      'eventually',
      'tap'
    ]
    const steps = [
      ...actions.map((action) => make({ action, name: 'x', value: 'v' })),
      ...fixtureIndex().steps,
      make({ kind: 'failure' })
    ]
    for (const step of steps) {
      const { key, element } = describeTraceStep(step)
      expect(englishText(key)).not.toBe(key)
      if (element) expect(englishText(element.key)).not.toBe(element.key)
    }
  })
})

describe('describeTraceStep hardening', () => {
  it('drops the query, fragment and credentials from the navigate url', () => {
    const result = describeTraceStep(
      make({ action: 'navigate', url: 'http://u:p@127.0.0.1:55539/a/b?token=abc#x' })
    )
    expect(result.values.url).toBe('http://127.0.0.1:55539/a/b')
    expect(
      describeTraceStep(make({ action: 'navigate', url: 'not a url?token=abc' })).values.url
    ).toBe('not a url')
  })

  it.each([
    ['http://user:pa ss@[bad/path?token=abc', 'http://[bad/path'],
    ['http://u:p@exa mple.com/a?x=1', 'http://exa mple.com/a'],
    ['//u:p@host/a#frag', '//host/a'],
    ['http://[bad/a@b', 'http://[bad/a@b']
  ])('drops credentials from an address it cannot parse: %s', (url, expected) => {
    expect(plainUrl(url)).toBe(expected)
  })

  it('keeps unnamed in step with the shared English text', () => {
    expect(englishText('traceViewer.element.unnamed')).toBe(THIS_ELEMENT)
  })

  it('never leaks a locator, whatever the strategy', () => {
    const locators = [
      { strategy: 'xpath', selector: '//div[@id="leak-x"]', within: [] },
      { strategy: 'id', selector: 'leak-id', within: [] },
      { strategy: 'css', selector: '[data-testid="leak-tid"]', within: [] },
      {
        strategy: 'css',
        selector: 'leak-inner',
        within: [
          { strategy: 'xpath', selector: '//leak-outer' },
          { strategy: 'id', selector: 'leak-mid' }
        ]
      }
    ]
    for (const locator of locators) {
      for (const action of ['click', 'send_keys', 'find_element', 'text']) {
        const text = JSON.stringify(describeTraceStep(make({ action, locator, value: 'v' })))
        expect(text).not.toContain('leak')
      }
    }
  })
})

describe('traceFoundBy', () => {
  const loc = (strategy: string) => ({ strategy, selector: 'sel-value', within: [] })

  it('maps known strategies', () => {
    expect(traceFoundBy(loc('id'))).toEqual({ key: 'traceViewer.foundBy.id', values: {} })
    expect(traceFoundBy(loc('link_text'))).toEqual({
      key: 'traceViewer.foundBy.link_text',
      values: {}
    })
  })

  it('maps unknown strategies to other and null to null', () => {
    expect(traceFoundBy(loc('relative'))?.key).toBe('traceViewer.foundBy.other')
    expect(traceFoundBy(loc('accessibility_id'))?.key).toBe('traceViewer.foundBy.other')
    expect(traceFoundBy(null)).toBeNull()
  })

  it('only produces keys that exist in en.json', () => {
    for (const s of [
      'id',
      'css',
      'xpath',
      'name',
      'link_text',
      'partial_link_text',
      'class_name',
      'tag_name',
      'relative'
    ]) {
      const key = traceFoundBy(loc(s))!.key
      expect(englishText(key)).not.toBe(key)
    }
  })
})
