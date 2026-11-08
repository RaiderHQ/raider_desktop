import { describe, it, expect } from 'vitest'
import { describeTraceStep, plainUrl, traceFoundBy } from '../src/shared/trace/describeTraceStep'
import { THIS_ELEMENT } from '../src/shared/describeStep'
import { englishText } from '@shared/describeStepEnglish'
import type { RaiderTraceStep } from '../src/shared/types/raiderTrace'
import { fixtureIndex, runtimeFixtureIndex } from './helpers/traceFixture'

// The 4.0.0 runtime trace: navigate, clear, send_keys (one secret), click
const stepAt = (n: number): RaiderTraceStep =>
  runtimeFixtureIndex().steps.find((s) => s.index === n)!
const make = (over: Partial<RaiderTraceStep>): RaiderTraceStep => ({
  ...stepAt(6),
  ...over
})

describe('describeTraceStep', () => {
  it('describes the runtime fixture steps', () => {
    expect(describeTraceStep(stepAt(1))).toEqual({
      key: 'traceViewer.step.navigate',
      values: { url: 'https://raider-test-site.onrender.com/index.php' }
    })
    // The runtime stamps no label on a field found by label or id: the role alone names it
    expect(describeTraceStep(stepAt(2))).toMatchObject({
      key: 'traceViewer.step.clear',
      element: { key: 'traceViewer.element.role', values: { role: 'text box' } }
    })
    expect(describeTraceStep(stepAt(3))).toMatchObject({
      key: 'traceViewer.step.typeText',
      values: { text: 'aguspe' },
      element: { key: 'traceViewer.element.role', values: { role: 'text box' } }
    })
    expect(englishText('traceViewer.element.role', { role: 'text box' })).toBe('the text box')
    expect(describeTraceStep(stepAt(6))).toMatchObject({
      key: 'traceViewer.step.click',
      element: { key: 'traceViewer.element.withRole', values: { label: 'Login', role: 'button' } }
    })
  })

  it('the runtime fixture has no group, wait or read steps', () => {
    const index = runtimeFixtureIndex()
    expect(index.steps.map((s) => s.action)).toEqual([
      'navigate',
      'clear',
      'send_keys',
      'clear',
      'send_keys',
      'click'
    ])
    expect(index.steps.every((s) => s.kind !== 'group' && s.parentIndex === null)).toBe(true)
    expect(index.steps.find((s) => s.index === 6)!.locator).toEqual({
      strategy: 'role',
      selector: 'button, name: Login, exact: true',
      within: []
    })
    expect(index.steps.find((s) => s.index === 2)!.locator).toMatchObject({
      strategy: 'label',
      selector: 'Login name'
    })
    expect(index.steps.find((s) => s.index === 6)!.waitedMs).toBeGreaterThan(0)
  })

  it('never reveals a secret step', () => {
    const result = describeTraceStep(stepAt(5))
    expect(result.key).toBe('traceViewer.step.typeSecret')
    const text = JSON.stringify(result)
    expect(text).not.toContain('send_keys')
    expect(text).not.toContain('12341234')
    const forced = describeTraceStep(make({ action: 'send_keys', value: 'hunter2', secret: true }))
    expect(forced.key).toBe('traceViewer.step.typeSecret')
    expect(JSON.stringify(forced)).not.toContain('hunter2')
  })

  it('handles typing with no value', () => {
    expect(describeTraceStep(make({ action: 'send_keys', value: null })).key).toBe(
      'traceViewer.step.typeEmpty'
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

  // A 3.x trace still opens: its read steps and eventually groups are plain steps now
  it('describes the 3.13 fixture without its old vocabulary', () => {
    const old = fixtureIndex('trace-v1')
    const at = (n: number): RaiderTraceStep => old.steps.find((s) => s.index === n)!
    expect(describeTraceStep(at(4)).key).toBe('traceViewer.step.other') // find_element
    expect(describeTraceStep(at(7)).key).toBe('traceViewer.step.other') // eventually group
    expect(describeTraceStep(at(8)).key).toBe('traceViewer.step.other') // text
    expect(describeTraceStep(at(9)).key).toBe('traceViewer.step.other') // failed eventually
    expect(englishText(describeTraceStep(at(9)).key)).not.toMatch(/passed/i)
    expect(describeTraceStep(at(6))).toMatchObject({
      key: 'traceViewer.step.click',
      element: { key: 'traceViewer.element.withRole', values: { label: 'Go', role: 'button' } }
    })
    for (const action of ['select_by', 'hover', 'drag_and_drop', 'scroll_into_view', 'displayed?'])
      expect(describeTraceStep(make({ action })).key).toBe('traceViewer.step.other')
  })

  it('names an element with a label but no known role', () => {
    expect(describeTraceStep(make({ element: { label: 'Menu', role: 'weird' } })).element).toEqual({
      key: 'traceViewer.element.named',
      values: { label: 'Menu' }
    })
  })

  it('an element with neither a label nor a known role is this element', () => {
    expect(describeTraceStep(make({ element: { role: 'weird' } })).element?.key).toBe(
      'traceViewer.element.unnamed'
    )
    expect(describeTraceStep(make({ element: null })).element?.key).toBe(
      'traceViewer.element.unnamed'
    )
  })

  it('never puts a selector or error text into the description', () => {
    const result = describeTraceStep(
      make({
        locator: { strategy: 'role', selector: 'button, name: secret-sel', within: [] },
        error: { className: 'Raider::NotActionable', message: 'boom-msg' }
      })
    )
    const text = JSON.stringify(result)
    for (const leak of ['secret-sel', 'boom-msg', 'NotActionable']) expect(text).not.toContain(leak)
  })

  it('only produces keys that exist in en.json', () => {
    const actions = ['navigate', 'click', 'send_keys', 'clear', 'submit', 'match_screenshot', 'tap']
    const steps = [
      ...actions.map((action) => make({ action, name: 'x', value: 'v' })),
      ...runtimeFixtureIndex().steps,
      ...fixtureIndex('trace-v1').steps,
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
      { strategy: 'role', selector: 'button, name: leak-name, exact: true', within: [] },
      { strategy: 'label', selector: 'leak-label', within: [] },
      { strategy: 'text', selector: 'leak-text', within: [] },
      { strategy: 'test_id', selector: 'leak-tid', within: [] },
      {
        strategy: 'css',
        selector: 'leak-inner',
        within: [
          { strategy: 'xpath', selector: '//leak-outer' },
          { strategy: 'role', selector: 'dialog, name: leak-mid' }
        ]
      }
    ]
    for (const locator of locators) {
      for (const action of ['click', 'send_keys', 'clear', 'submit']) {
        const text = JSON.stringify(describeTraceStep(make({ action, locator, value: 'v' })))
        expect(text).not.toContain('leak')
      }
    }
  })
})

describe('traceFoundBy', () => {
  const loc = (strategy: string): { strategy: string; selector: string; within: never[] } => ({
    strategy,
    selector: 'sel-value',
    within: []
  })

  it('maps the runtime strategies', () => {
    expect(traceFoundBy(loc('role'))).toEqual({ key: 'traceViewer.foundBy.role', values: {} })
    expect(traceFoundBy(loc('label'))).toEqual({ key: 'traceViewer.foundBy.label', values: {} })
    expect(traceFoundBy(loc('text'))?.key).toBe('traceViewer.foundBy.text')
    expect(traceFoundBy(loc('test_id'))?.key).toBe('traceViewer.foundBy.test_id')
    expect(traceFoundBy(loc('placeholder'))?.key).toBe('traceViewer.foundBy.placeholder')
    expect(traceFoundBy(loc('alt'))?.key).toBe('traceViewer.foundBy.alt')
    expect(traceFoundBy(loc('title'))?.key).toBe('traceViewer.foundBy.title')
  })

  it('maps Selenium strategies', () => {
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

  it('reads the runtime fixture', () => {
    const steps = runtimeFixtureIndex().steps
    expect(traceFoundBy(steps[5].locator)?.key).toBe('traceViewer.foundBy.role')
    expect(traceFoundBy(steps[1].locator)?.key).toBe('traceViewer.foundBy.label')
    expect(traceFoundBy(steps[0].locator)).toBeNull()
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
      'role',
      'label',
      'text',
      'test_id',
      'placeholder',
      'alt',
      'title',
      'relative'
    ]) {
      const key = traceFoundBy(loc(s))!.key
      expect(englishText(key)).not.toBe(key)
    }
  })
})
