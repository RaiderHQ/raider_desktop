import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  getPrioritizedSelector,
  cssEscape,
  isRegion,
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

describe('a label with hidden markup', () => {
  // The role name skips the aria-hidden asterisk, so the role XPath (normalize-space) finds
  // nothing and the pick falls through; the label locator keeps the asterisk, as the
  // runtime's label: XPath compares it, and is found
  it('falls from role to a label that carries the hidden text', () => {
    document.body.innerHTML =
      '<label for="e">Email <span aria-hidden="true">*</span></label><input id="e">'
    const el = document.getElementById('e')!
    const pick = getPrioritizedSelector(el, ['role', 'label', 'id'])
    expect(pick.locator).toEqual({ by: 'label', text: 'Email *' })
    expect(pick.strategy).toBe('xpath')
  })
})

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

  // The label net is the runtime's Selectors.label(value, exact: true): one extra candidate
  // under strict mode raises AmbiguousMatch there, so it must fail uniqueness here.
  describe('label candidates, as the runtime counts them', () => {
    it('emits the runtime label selector, branch for branch', () => {
      document.body.innerHTML = '<label for="e">Email</label><input id="e">'
      expect(pick(document.querySelector('input')!, ['label']).selector).toBe(
        'id(//label[normalize-space(.)="Email"]/@for)' +
          ' | //label[normalize-space(.)="Email"]//*[(self::input or self::textarea or self::select' +
          " or self::button or self::meter or self::output or self::progress) and not(self::input[@type='hidden'])]" +
          ' | //*[normalize-space(@aria-label)="Email"]' +
          ' | //*[@aria-labelledby and normalize-space(string(id(@aria-labelledby)))="Email"]'
      )
    })

    it('does not pick the label of a field whose wrapping label also holds a button with text', () => {
      // The label's own words are "Email" but its normalize-space is "Email ?": no runtime match
      document.body.innerHTML = '<label>Email <button>?</button><input id="e"></label>'
      expect(pick(document.querySelector('input')!, ['label', 'id', 'css']).locator).toEqual({
        by: 'id',
        value: 'e'
      })
    })

    it('does not pick the label of a field whose wrapping label also holds a text-less button', () => {
      document.body.innerHTML =
        '<label>Email <input id="e"><button aria-label="Help"></button></label>'
      expect(pick(document.querySelector('input')!, ['label', 'id', 'css']).locator).toEqual({
        by: 'id',
        value: 'e'
      })
    })

    it.each(['meter', 'output', 'progress', 'div'])(
      'rejects a label[for] when a label with the same text names a %s elsewhere',
      (tag) => {
        document.body.innerHTML = `<label for="e">Email</label><input id="e"><label for="m">Email</label><${tag} id="m"></${tag}>`
        expect(pick(document.querySelector('input')!, ['label', 'id']).locator).toEqual({
          by: 'id',
          value: 'e'
        })
      }
    )

    it('counts an aria-labelledby element with the same text as a candidate', () => {
      document.body.innerHTML =
        '<label for="e">Email</label><input id="e"><span id="x">Email</span><input id="f" aria-labelledby="x">'
      expect(pick(document.querySelector('#e')!, ['label', 'id']).locator).toEqual({
        by: 'id',
        value: 'e'
      })
    })

    it('counts a padded aria-label with the same text as a candidate', () => {
      document.body.innerHTML =
        '<label for="e">Email</label><input id="e"><button id="b" aria-label=" Email "></button>'
      expect(pick(document.querySelector('#e')!, ['label', 'id']).locator).toEqual({
        by: 'id',
        value: 'e'
      })
    })

    it('does not count a hidden input inside the label', () => {
      document.body.innerHTML = '<label>Email <input type="hidden" name="t"><input id="e"></label>'
      expect(pick(document.querySelector('#e')!, ['label', 'id']).locator).toEqual({
        by: 'label',
        text: 'Email'
      })
    })

    it('still picks a label whose only candidate is the field', () => {
      document.body.innerHTML =
        '<label for="e">Email</label><input id="e"><label for="n">Name</label><meter id="n"></meter>'
      expect(pick(document.querySelector('#e')!, ['label', 'id']).locator).toEqual({
        by: 'label',
        text: 'Email'
      })
    })
  })

  // The role name is the engine's visible walk, but roleXPath can only compare normalize-space(),
  // which keeps aria-hidden text: XPath 1.0 cannot subtract a subtree. The role pick fails its
  // own check and the step falls to text (the runtime's text: key keeps hidden text too).
  it('falls from role to text for a button whose icon carries aria-hidden text', () => {
    document.body.innerHTML = '<button><span aria-hidden="true">x</span> Close</button>'
    expect(pick(document.querySelector('button')!).locator).toEqual({ by: 'text', text: 'x Close' })
  })

  it('names a button by its visible words when the icon has none', () => {
    document.body.innerHTML = '<button><i class="icon" aria-hidden="true"></i> Save</button>'
    expect(pick(document.querySelector('button')!).locator).toMatchObject({
      by: 'role',
      role: 'button',
      name: 'Save'
    })
  })

  // A label scan per candidate field took ~16 s here in jsdom; one scan via id() takes ~0.3 s.
  // The bound leaves headroom for slow machines while still catching the quadratic form.
  describe('on a large form with a repeated label', () => {
    beforeEach(() => {
      const rows = Array.from(
        { length: 500 },
        (_, i) => `<div><label for="q${i}">Quantity</label><input id="q${i}" type="number"></div>`
      ).join('')
      document.body.innerHTML = `${rows}<label for="e">Email</label><input id="e" type="email">`
    })

    it('stays fast and picks the uniquely labelled field', () => {
      const start = performance.now()
      const result = pick(document.getElementById('e')!)
      expect(performance.now() - start).toBeLessThan(2000)
      expect(result.locator).toMatchObject({ by: 'role', role: 'textbox', name: 'Email' })
    })

    it('stays fast and rejects the label shared by every row', () => {
      const start = performance.now()
      const result = pick(document.getElementById('q250')!, ['role', 'label', 'css'])
      expect(performance.now() - start).toBeLessThan(2000)
      expect(result.locator?.by).toBe('css')
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

  describe('containers (D16)', () => {
    it('does not name a container by the text of the things inside it', () => {
      document.body.innerHTML =
        '<main><div class="page"><button>Save</button><p>Email</p><h2>Summer sale</h2></div></main>'
      const div = document.querySelector('div')!
      const result = pick(div)
      expect(result.locator?.by).not.toBe('text')
      expect(result.selector).not.toContain('Summer sale')
    })

    it('does not name the body by the whole page text', () => {
      document.body.innerHTML = '<h1>Shop</h1><p>Welcome</p>'
      expect(pick(document.body).locator?.by).not.toBe('text')
    })

    it('still names a paragraph that holds its own text around inline marks', () => {
      document.body.innerHTML = '<div><p>Read the <b>terms</b> first</p><p>Other</p></div>'
      const p = document.querySelector('p')!
      expect(pick(p).locator).toEqual({ by: 'text', text: 'Read the terms first' })
    })

    it('names an item by its text when the text is its own', () => {
      document.body.innerHTML = '<ul><li>Apples</li><li>Pears</li></ul>'
      const li = document.querySelectorAll('li')[1]
      expect(pick(li).locator).toEqual({ by: 'text', text: 'Pears' })
    })

    it('does not name a cell or item by the controls inside it', () => {
      document.body.innerHTML =
        '<table><tr><td><button>Edit</button><button>Delete</button></td></tr></table>'
      expect(pick(document.querySelector('td')!).locator?.by).not.toBe('text')
      document.body.innerHTML = '<ul><li><a href="#">Home</a><a href="#">About</a></li></ul>'
      expect(pick(document.querySelector('li')!).locator?.by).not.toBe('text')
    })

    it('ignores whitespace and separators between children', () => {
      document.body.innerHTML = '<div>\n  <span>A</span>\n  <span>B</span>\n</div>'
      expect(pick(document.querySelector('div')!).locator?.by).not.toBe('text')
      document.body.innerHTML = '<nav><a href="#">Home</a> | <a href="#">About</a></nav>'
      expect(pick(document.querySelector('nav')!).locator?.by).not.toBe('text')
    })

    it('tells a click on a page region from a click on a named thing', () => {
      document.body.innerHTML =
        '<div class="page"><button>Save</button><p>Email</p></div><p>Read me</p>'
      expect(isRegion(document.querySelector('div')!)).toBe(true)
      expect(isRegion(document.body)).toBe(true)
      expect(isRegion(document.querySelector('button')!)).toBe(false)
      expect(isRegion(document.querySelectorAll('p')[1])).toBe(false)
    })
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

  it.each([
    ['<p>a</p><p id=":r1:">b</p>', 'p:nth-of-type(2)', 'html > body > p:nth-of-type(2)'],
    [
      '<div id="ember123"><p>a</p><p>b</p></div>',
      'div p:nth-of-type(2)',
      'html > body > div > p:nth-of-type(2)'
    ]
  ])('does not anchor the css path on a generated id in %s', (html, selector, expected) => {
    document.body.innerHTML = html
    expect(pick(document.querySelector(selector)!, ['css']).locator).toEqual({
      by: 'css',
      value: expected,
      positional: true
    })
  })

  it.each([
    ['<p>a</p><p id=":r1:">b</p>', 'p:nth-of-type(2)', '/html/body/p[2]'],
    ['<div id="ember123"><p>a</p><p>b</p></div>', 'div p:nth-of-type(2)', '/html/body/div[1]/p[2]']
  ])('does not anchor the xpath on a generated id in %s', (html, selector, expected) => {
    document.body.innerHTML = html
    expect(pick(document.querySelector(selector)!, ['xpath']).selector).toBe(expected)
  })

  it('still anchors the fallback paths on a stable id', () => {
    document.body.innerHTML = '<div id="cart"><p>a</p><p>b</p></div>'
    const el = document.querySelector('div p:nth-of-type(2)')!
    expect(pick(el, ['css']).selector).toBe('#cart > p:nth-of-type(2)')
    expect(pick(el, ['xpath']).selector).toBe('//*[@id="cart"]/p[2]')
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
