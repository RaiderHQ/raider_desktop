import { describe, it, expect } from 'vitest'
import { isStep, isLocator, isWeakLocator } from '../src/shared/types/step'

const el = { strategy: 'css', value: '#a' }

describe('isStep', () => {
  it.each([
    { id: '1', kind: 'navigate', url: 'http://x' },
    { id: '1', kind: 'click', element: el },
    { id: '1', kind: 'type', element: el, text: 'hi' },
    { id: '1', kind: 'type', element: el, text: '', secret: true },
    {
      id: '1',
      kind: 'type',
      element: el,
      text: '',
      secret: true,
      secretName: 'RAIDER_SECRET_LOGIN'
    },
    { id: '1', kind: 'type', element: el, text: '', secret: true, secretName: 'RAIDER_SECRET_1' },
    { id: '1', kind: 'pressKey', element: el, key: 'Enter' },
    { id: '1', kind: 'wait', element: el, until: 'visible' },
    { id: '1', kind: 'assert', check: 'displayed', element: el },
    { id: '1', kind: 'assert', check: 'titleEquals', expected: 'T' },
    { id: '1', kind: 'switchFrame' },
    { id: '1', kind: 'switchFrame', element: { ...el, label: 'f' } },
    { id: '1', kind: 'custom', code: 'puts 1' }
  ])('accepts %j', (s) => expect(isStep(s)).toBe(true))

  it.each([
    { kind: 'nope' },
    { id: '1', kind: 'nope' },
    { kind: 'navigate', url: 'x' },
    { id: '1', kind: 'navigate' },
    { id: '1', kind: 'click' },
    { id: '1', kind: 'click', element: { strategy: 'name', value: 'a' } },
    { id: '1', kind: 'click', element: { strategy: 'id', value: 3 } },
    { id: '1', kind: 'type', element: el },
    { id: '1', kind: 'type', element: el, text: '', secret: 'yes' },
    { id: '1', kind: 'type', element: el, text: 'hunter2', secret: true },
    { id: '1', kind: 'type', element: el, text: '', secret: true, secretName: 'admin pw' },
    { id: '1', kind: 'type', element: el, text: 'x', secretName: 'RAIDER_SECRET_1' },
    // Only RAIDER_SECRET_ variables: anything else could read a real credential
    { id: '1', kind: 'type', element: el, text: '', secret: true, secretName: 'GITHUB_TOKEN' },
    { id: '1', kind: 'type', element: el, text: '', secret: true, secretName: 'RAIDER_TOKEN' },
    { id: '1', kind: 'type', element: el, text: '', secret: true, secretName: 'RAIDER_SECRET' },
    { id: '1', kind: 'wait', element: el, until: 'gone' },
    { id: '1', kind: 'assert', check: 'bogus' },
    { id: '1', kind: 'assert', check: 'textEquals', expected: 5 },
    { id: '1', kind: 'assert', check: 'displayed' },
    { id: '1', kind: 'assert', check: 'textEquals', element: el },
    { id: '1', kind: 'assert', check: 'textIncludes', expected: 'x' },
    { id: '1', kind: 'assert', check: 'valueEquals', element: el },
    { id: '1', kind: 'assert', check: 'titleEquals' },
    { id: '1', kind: 'assert', check: 'urlIncludes' },
    { id: '1', kind: 'switchFrame', element: 'x' },
    { id: '1', kind: 'custom', code: 1 },
    'page.click',
    null,
    undefined,
    42
  ])('rejects %j', (s) => expect(isStep(s)).toBe(false))
})

const goodLocators = [
  { by: 'role', role: 'button', name: 'Log in' },
  { by: 'role', role: 'tab', name: 'Billing' },
  { by: 'role', role: 'button', name: 'Save', nameFrom: 'content' },
  { by: 'role', role: 'button', name: 'Close', nameFrom: 'aria-label' },
  { by: 'role', role: 'textbox', name: 'Email', nameFrom: 'other' },
  { by: 'label', text: 'Email' },
  { by: 'testId', attribute: 'data-testid', value: 'submit' },
  { by: 'text', text: 'Sign up' },
  { by: 'id', value: 'login' },
  { by: 'css', value: '.btn', positional: false },
  { by: 'css', value: 'li:nth-child(2)', positional: true },
  { by: 'xpath', value: '//a[1]' }
]

const badLocators = [
  null,
  'role',
  {},
  { by: 'nope', value: 'x' },
  { by: 'role', role: 'button' },
  { by: 'role', role: '', name: 'x' },
  { by: 'role', role: 'button', name: '' },
  { by: 'role', role: 'button', name: 'x', nameFrom: 'title' },
  { by: 'role', role: 'button', name: 'x', nameFrom: null },
  { by: 'label', text: '' },
  { by: 'label' },
  { by: 'testId', attribute: '', value: 'x' },
  { by: 'testId', attribute: 'data-testid', value: '' },
  { by: 'text', text: '' },
  { by: 'id', value: '' },
  { by: 'css', value: '.x' },
  { by: 'css', value: '.x', positional: 'yes' },
  { by: 'css', value: '', positional: false },
  { by: 'xpath', value: '' }
]

describe('isLocator', () => {
  it.each(goodLocators)('accepts %j', (l) => expect(isLocator(l)).toBe(true))
  it.each(badLocators)('rejects %j', (l) => expect(isLocator(l)).toBe(false))
})

describe('isStep with a locator', () => {
  it('accepts an element with a valid locator', () => {
    const loc = { by: 'role', role: 'button', name: 'Log in' }
    expect(isStep({ id: '1', kind: 'click', element: { ...el, locator: loc } })).toBe(true)
  })
  it('accepts an element without a locator', () => {
    expect(isStep({ id: '1', kind: 'click', element: el })).toBe(true)
  })
  it('rejects an element with a malformed locator', () => {
    const element = { ...el, locator: { by: 'role', role: 'button' } }
    expect(isStep({ id: '1', kind: 'click', element })).toBe(false)
  })
})

describe('isWeakLocator', () => {
  it('is true for positional css and xpath', () => {
    expect(isWeakLocator({ by: 'css', value: 'li:nth-child(2)', positional: true })).toBe(true)
    expect(isWeakLocator({ by: 'xpath', value: '//a[1]' })).toBe(true)
  })
  it('is false for everything else and for undefined', () => {
    expect(isWeakLocator({ by: 'css', value: '.x', positional: false })).toBe(false)
    expect(isWeakLocator({ by: 'id', value: 'x' })).toBe(false)
    expect(isWeakLocator({ by: 'role', role: 'button', name: 'x' })).toBe(false)
    expect(isWeakLocator(undefined)).toBe(false)
  })
})
