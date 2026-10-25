import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getPrioritizedSelector, cssEscape } from '../src/preload/selectorStrategy'

const PRIORITIES = ['data-testid', 'id', 'css', 'xpath']

describe('getPrioritizedSelector', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('prefers data-testid over id when configured first', () => {
    document.body.innerHTML = '<button id="save" data-testid="save-btn">Save</button>'
    const el = document.getElementById('save')!
    expect(getPrioritizedSelector(el, PRIORITIES)).toEqual({
      selector: '[data-testid="save-btn"]',
      strategy: 'css'
    })
  })

  it('falls through to id when data-testid is duplicated', () => {
    document.body.innerHTML =
      '<button id="a" data-testid="dup">A</button><button id="b" data-testid="dup">B</button>'
    const el = document.getElementById('b')!
    expect(getPrioritizedSelector(el, PRIORITIES)).toEqual({ selector: 'b', strategy: 'id' })
  })

  it('uses id first with the default-style order', () => {
    document.body.innerHTML = '<button id="save" data-testid="save-btn">Save</button>'
    const el = document.getElementById('save')!
    expect(getPrioritizedSelector(el, ['id', 'data-testid']).strategy).toBe('id')
  })

  it('produces a resolvable css selector for ids containing a colon', () => {
    document.body.innerHTML = '<div><span id="a:b">x</span></div>'
    const el = document.getElementById('a:b')!
    const { selector, strategy } = getPrioritizedSelector(el, ['css'])
    expect(strategy).toBe('css')
    expect(document.querySelector(selector)).toBe(el)
  })

  it('does not throw for an id that needs escaping under the id strategy', () => {
    document.body.innerHTML = '<span id="a:b">x</span><span id="a:b">y</span>'
    const el = document.querySelectorAll('span')[1]
    expect(() => getPrioritizedSelector(el, ['id', 'xpath'])).not.toThrow()
    expect(getPrioritizedSelector(el, ['id', 'xpath']).strategy).toBe('xpath')
  })

  it('escapes double quotes in attribute values', () => {
    document.body.innerHTML = '<button data-testid=\'say "hi"\'>x</button>'
    const el = document.querySelector('button')!
    const { selector, strategy } = getPrioritizedSelector(el, ['data-testid'])
    expect(strategy).toBe('css')
    expect(document.querySelector(selector)).toBe(el)
  })

  it('returns xpath when requested', () => {
    document.body.innerHTML = '<p>one</p><p>two</p>'
    const el = document.querySelectorAll('p')[1]
    const { selector, strategy } = getPrioritizedSelector(el, ['xpath'])
    expect(strategy).toBe('xpath')
    expect(selector).toBe('body/p[2]')
  })

  it('ignores an unusable attribute name instead of throwing', () => {
    document.body.innerHTML = '<p id="x">one</p>'
    const el = document.getElementById('x')!
    expect(getPrioritizedSelector(el, ['not valid!', 'id']).strategy).toBe('id')
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
    ;(globalThis as { CSS?: unknown }).CSS = { escape: (s: string) => `native(${s})` }
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
