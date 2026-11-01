import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  getPrioritizedSelector,
  cssEscape,
  xpathCount,
  DEFAULT_PRIORITIES
} from '../src/preload/selectorStrategy'

const PRIORITIES = ['testId', 'id', 'css', 'xpath']
const TEST_ID = 'data-testid'

// The resolved Selenium form must find the picked element and nothing else.
function matches(strategy: string, selector: string): Element[] {
  if (strategy === 'id') return Array.from(document.querySelectorAll(`#${cssEscape(selector)}`))
  if (strategy === 'css') return Array.from(document.querySelectorAll(selector))
  const snap = document.evaluate(
    selector,
    document,
    null,
    XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
    null
  )
  return Array.from({ length: snap.snapshotLength }, (_, i) => snap.snapshotItem(i) as Element)
}

function pick(el: Element, priorities = DEFAULT_PRIORITIES, testIdAttribute = TEST_ID) {
  const result = getPrioritizedSelector(el, priorities, testIdAttribute)
  expect(matches(result.strategy, result.selector)).toEqual([el])
  return result
}

describe('getPrioritizedSelector: candidates', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it.each([
    ['<button>Save</button>', 'button', 'button', 'Save'],
    ['<input type="submit" value="Save">', 'input', 'button', 'Save'],
    ['<div role="button">Save</div>', 'div', 'button', 'Save'],
    ['<button aria-label="Close"><svg></svg></button>', 'button', 'button', 'Close'],
    ['<a href="/p">Pricing</a>', 'a', 'link', 'Pricing'],
    ['<label for="e">Email</label><input id="e" type="email">', 'input', 'textbox', 'Email'],
    ['<textarea placeholder="Notes"></textarea>', 'textarea', 'textbox', 'Notes'],
    ['<label>Remember me <input type="checkbox"></label>', 'input', 'checkbox', 'Remember me'],
    ['<input type="radio" aria-label="Express">', 'input', 'radio', 'Express'],
    ['<label for="c">Country</label><select id="c"></select>', 'select', 'combobox', 'Country'],
    ['<h2>Billing</h2>', 'h2', 'heading', 'Billing'],
    [
      '<span id="lbl">Search terms</span><input aria-labelledby="lbl">',
      'input',
      'textbox',
      'Search terms'
    ]
  ])('%s, clicking %s, gets role %s', (html, selector, role, name) => {
    document.body.innerHTML = `<main>${html}</main>`
    const result = pick(document.querySelector(selector)!)
    expect(result.strategy).toBe('xpath')
    expect(result.locator).toMatchObject({ by: 'role', role, name })
  })

  it.each([
    ['<button>Save</button>', 'button', 'content'],
    ['<input type="button" value="Apply">', 'input', 'content'],
    ['<button aria-label="Close"><svg></svg></button>', 'button', 'aria-label'],
    ['<label for="e">Email</label><input id="e">', 'input', 'other'],
    ['<input type="image" alt="Go" src="go.png">', 'input', 'other']
  ])('%s records where its name came from', (html, selector, nameFrom) => {
    document.body.innerHTML = html
    expect(pick(document.querySelector(selector)!).locator).toMatchObject({ by: 'role', nameFrom })
  })

  it.each([
    ['<button aria-label="Close"><svg></svg></button>', 'button', 'button', 'aria-label'],
    ['<div role="button" aria-label="Close"></div>', 'div', 'div', 'aria-label'],
    ['<textarea aria-label="Notes"></textarea>', 'textarea', 'textarea', 'aria-label']
  ])('%s records the tag and an exact aria-label name', (html, selector, tag, nameFrom) => {
    document.body.innerHTML = html
    expect(pick(document.querySelector(selector)!).locator).toMatchObject({
      by: 'role',
      tag,
      nameFrom
    })
  })

  it('gets role button for an input of type button', () => {
    document.body.innerHTML = '<input type="button" value="Apply"><input type="text">'
    expect(pick(document.querySelector('input')!).locator).toEqual({
      by: 'role',
      role: 'button',
      name: 'Apply',
      nameFrom: 'content',
      tag: 'input'
    })
  })

  it('does not give a file input the textbox role', () => {
    document.body.innerHTML = '<label for="f">Upload</label><input id="f" type="file">'
    expect(pick(document.querySelector('input')!).locator).toEqual({ by: 'label', text: 'Upload' })
  })

  it('picks the label for a text field when role is not first', () => {
    document.body.innerHTML = '<label for="e">Email</label><input id="e" name="email">'
    const result = pick(document.querySelector('input')!, ['label', 'css'])
    expect(result.strategy).toBe('xpath')
    expect(result.locator).toEqual({ by: 'label', text: 'Email' })
  })

  it('picks the label for a field wrapped in its label', () => {
    document.body.innerHTML = '<label>User name <input></label>'
    expect(pick(document.querySelector('input')!, ['label']).locator).toEqual({
      by: 'label',
      text: 'User name'
    })
  })

  it('uses the configured test-id attribute', () => {
    document.body.innerHTML = '<div data-qa="cart"></div><div data-testid="cart"></div>'
    const el = document.querySelector('[data-qa]')!
    expect(pick(el, DEFAULT_PRIORITIES, 'data-qa')).toEqual({
      selector: '[data-qa="cart"]',
      strategy: 'css',
      locator: { by: 'testId', attribute: 'data-qa', value: 'cart' }
    })
  })

  it('treats a custom priority name as a test-id attribute', () => {
    document.body.innerHTML = '<div data-cy="total"></div>'
    expect(pick(document.querySelector('div')!, ['data-cy', 'css']).locator).toEqual({
      by: 'testId',
      attribute: 'data-cy',
      value: 'total'
    })
  })

  it('picks the innermost element for text shared with its parent', () => {
    document.body.innerHTML = '<div><span>Order total</span></div>'
    const span = document.querySelector('span')!
    expect(pick(span).locator).toEqual({ by: 'text', text: 'Order total' })
    // the wrapper cannot claim the text; it falls through to another pick
    expect(pick(document.querySelector('div')!).locator?.by).not.toBe('text')
  })

  it.each([':r1:', 'ember123', 'a1b2c3d4e5', 'btn-12345'])('skips the generated id %s', (id) => {
    document.body.innerHTML = '<p>a</p><p>b</p>'
    const el = document.querySelectorAll('p')[1]
    el.id = id
    expect(pick(el, ['id', 'css', 'xpath']).locator?.by).not.toBe('id')
  })

  it('uses a stable id', () => {
    document.body.innerHTML = '<div id="login"></div>'
    expect(pick(document.querySelector('div')!)).toEqual({
      selector: 'login',
      strategy: 'id',
      locator: { by: 'id', value: 'login' }
    })
  })

  it.each([0, 1])('never returns a pick matching two identical buttons (button %i)', (index) => {
    document.body.innerHTML = '<form><button>Save</button><button>Save</button></form>'
    const result = pick(document.querySelectorAll('button')[index])
    expect(result.locator).toEqual({ by: 'css', value: result.selector, positional: true })
  })

  it('escapes both quote types in a name', () => {
    document.body.innerHTML = `<button>Don't "save"</button>`
    const result = pick(document.querySelector('button')!)
    expect(result.selector).toContain('concat(')
    expect(result.locator).toEqual({
      by: 'role',
      role: 'button',
      name: `Don't "save"`,
      nameFrom: 'content',
      tag: 'button'
    })
  })

  it('prefers a short css selector over the positional path', () => {
    document.body.innerHTML = '<div><span class="badge">1</span><span>1</span></div>'
    expect(pick(document.querySelector('.badge')!)).toEqual({
      selector: 'span.badge',
      strategy: 'css',
      locator: { by: 'css', value: 'span.badge', positional: false }
    })
  })

  it('skips generated-looking classes in short css', () => {
    document.body.innerHTML = '<div><i class="css-1a2b3c4d"></i><i></i></div>'
    const result = pick(document.querySelector('i')!, ['css'])
    expect(result.locator).toMatchObject({ by: 'css', positional: true })
  })

  it('falls back to xpath when nothing else is unique', () => {
    document.body.innerHTML = '<span id="a:b">x</span><span id="a:b">y</span>'
    const el = document.querySelectorAll('span')[1]
    const result = pick(el, ['id', 'xpath'])
    expect(result.strategy).toBe('xpath')
    expect(result.locator).toEqual({ by: 'xpath', value: result.selector })
  })
})

describe('xpathCount', () => {
  it('counts matches and treats an invalid expression as zero', () => {
    document.body.innerHTML = '<p></p><p></p>'
    expect(xpathCount('//p')).toBe(2)
    expect(xpathCount('//p[')).toBe(0)
  })
})

describe('getPrioritizedSelector', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('prefers test-id over id when configured first', () => {
    document.body.innerHTML = '<button id="save" data-testid="save-btn">Save</button>'
    const el = document.getElementById('save')!
    expect(getPrioritizedSelector(el, PRIORITIES, TEST_ID)).toEqual({
      selector: '[data-testid="save-btn"]',
      strategy: 'css',
      locator: { by: 'testId', attribute: 'data-testid', value: 'save-btn' }
    })
  })

  it('falls through to id when the test-id is duplicated', () => {
    document.body.innerHTML =
      '<button id="a" data-testid="dup">A</button><button id="b" data-testid="dup">B</button>'
    const el = document.getElementById('b')!
    expect(getPrioritizedSelector(el, PRIORITIES, TEST_ID)).toEqual({
      selector: 'b',
      strategy: 'id',
      locator: { by: 'id', value: 'b' }
    })
  })

  it('uses id first with an id-first order', () => {
    document.body.innerHTML = '<button id="save" data-testid="save-btn">Save</button>'
    const el = document.getElementById('save')!
    expect(getPrioritizedSelector(el, ['id', 'testId'], TEST_ID).strategy).toBe('id')
  })

  it('produces a resolvable css selector for ids containing a colon', () => {
    document.body.innerHTML = '<div><span id="a:b">x</span></div>'
    const el = document.getElementById('a:b')!
    const { selector, strategy } = getPrioritizedSelector(el, ['css'], TEST_ID)
    expect(strategy).toBe('css')
    expect(document.querySelector(selector)).toBe(el)
  })

  it('does not throw for an id that needs escaping under the id strategy', () => {
    document.body.innerHTML = '<span id="a:b">x</span><span id="a:b">y</span>'
    const el = document.querySelectorAll('span')[1]
    expect(() => getPrioritizedSelector(el, ['id', 'xpath'], TEST_ID)).not.toThrow()
    expect(getPrioritizedSelector(el, ['id', 'xpath'], TEST_ID).strategy).toBe('xpath')
  })

  it('escapes double quotes in attribute values', () => {
    document.body.innerHTML = '<button data-testid=\'say "hi"\'>x</button>'
    const el = document.querySelector('button')!
    const { selector, strategy } = getPrioritizedSelector(el, ['testId'], TEST_ID)
    expect(strategy).toBe('css')
    expect(document.querySelector(selector)).toBe(el)
  })

  it('returns a resolvable xpath when requested', () => {
    document.body.innerHTML = '<p>one</p><p>two</p>'
    const el = document.querySelectorAll('p')[1]
    const { selector, strategy } = getPrioritizedSelector(el, ['xpath'], TEST_ID)
    expect(strategy).toBe('xpath')
    expect(selector).toBe('/html/body/p[2]')
    expect(matches(strategy, selector)).toEqual([el])
  })

  it.each([
    ['plain', 'save', '//*[@id="save"]'],
    ['a double quote', 'say "hi"', `//*[@id='say "hi"']`],
    ['a single quote', "it's", `//*[@id="it's"]`],
    ['both quote types', `it's "x"`, `//*[@id=concat('it',"'",'s "x"')]`]
  ])('quotes an xpath id containing %s', (_label, id, expected) => {
    const el = document.createElement('p')
    el.id = id
    document.body.appendChild(el)
    const { selector } = getPrioritizedSelector(el, ['xpath'], TEST_ID)
    expect(selector).toBe(expected)
    const found = document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE)
    expect(found.singleNodeValue).toBe(el)
  })

  it('ignores an unusable attribute name instead of throwing', () => {
    document.body.innerHTML = '<p id="x">one</p>'
    const el = document.getElementById('x')!
    expect(getPrioritizedSelector(el, ['not valid!', 'id'], TEST_ID).strategy).toBe('id')
  })
})

describe('cssEscape', () => {
  const original = (globalThis as { CSS?: unknown }).CSS

  afterEach(() => {
    ;(globalThis as { CSS?: unknown }).CSS = original
  })

  const cases: Array<[string, string]> = [
    ['a:b', 'a\\:b'],
    ['1abc', '\\31 abc'],
    ['-1', '-\\31 '],
    ['-', '\\-'],
    ['a b', 'a\\ b'],
    ['a"b', 'a\\"b'],
    ['ok_name-1', 'ok_name-1'],
    ['\u0000', '�']
  ]

  it('fallback implements the CSSOM algorithm when CSS.escape is absent', () => {
    ;(globalThis as { CSS?: unknown }).CSS = undefined
    for (const [input, expected] of cases) expect(cssEscape(input)).toBe(expected)
  })

  it('uses native CSS.escape when present', () => {
    ;(globalThis as { CSS?: unknown }).CSS = { escape: (s: string): string => `native(${s})` }
    expect(cssEscape('x')).toBe('native(x)')
  })

  it('fallback result resolves in querySelector', () => {
    ;(globalThis as { CSS?: unknown }).CSS = undefined
    document.body.innerHTML = '<i id="1a:b c"></i>'
    expect(document.querySelector(`#${cssEscape('1a:b c')}`)).toBe(
      document.getElementById('1a:b c')
    )
  })
})
