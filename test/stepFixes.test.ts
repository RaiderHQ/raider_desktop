import { describe, it, expect } from 'vitest'
import { canRePick, editableValue, isInsideFrame, withValue } from '@shared/stepFixes'
import type { Step } from '@shared/types/step'

const el = { strategy: 'css' as const, value: '#x' }
const nav: Step = { id: 'n', kind: 'navigate', url: 'https://x.test' }
const click: Step = { id: 'c', kind: 'click', element: el }
const type: Step = { id: 't', kind: 'type', element: el, text: 'a' }
const secret: Step = { id: 's', kind: 'type', element: el, text: '', secret: true }
const assert = (check: Extract<Step, { kind: 'assert' }>['check'], expected?: string): Step => ({
  id: 'as',
  kind: 'assert',
  check,
  element: el,
  expected
})

describe('editableValue', () => {
  it('reads what a step types, expects or visits', () => {
    expect(editableValue(type)).toBe('a')
    expect(editableValue(assert('textEquals', 'Hi'))).toBe('Hi')
    expect(editableValue(assert('urlIncludes', '/cart'))).toBe('/cart')
    expect(editableValue(assert('titleEquals'))).toBe('')
    expect(editableValue(nav)).toBe('https://x.test')
  })

  it('has nothing to edit for a secret, a plain check or another kind of step', () => {
    expect(editableValue(secret)).toBeNull()
    expect(editableValue(assert('displayed'))).toBeNull()
    expect(editableValue(click)).toBeNull()
    expect(editableValue({ id: 'u', kind: 'custom', code: 'x' })).toBeNull()
  })
})

describe('withValue', () => {
  it('sets only that field and keeps the id and kind', () => {
    expect(withValue(type, 'b')).toEqual({ ...type, text: 'b' })
    expect(withValue(assert('valueEquals', 'a'), 'b')).toEqual(assert('valueEquals', 'b'))
    expect(withValue(nav, 'https://y.test')).toEqual({ ...nav, url: 'https://y.test' })
  })
})

describe('isInsideFrame and canRePick', () => {
  const frame: Step = { id: 'f', kind: 'switchFrame', element: el }
  const top: Step = { id: 'f2', kind: 'switchFrame' }

  it('is inside a frame until the next switch back to the page', () => {
    expect(isInsideFrame([nav, frame, click], 2)).toBe(true)
    expect(isInsideFrame([nav, frame, top, click], 3)).toBe(false)
    expect(isInsideFrame([nav, click], 1)).toBe(false)
  })

  it('re-picks only a step with an element outside a frame', () => {
    expect(canRePick([nav, click], 1)).toBe(true)
    expect(canRePick([nav, frame, click], 2)).toBe(false)
    expect(canRePick([nav, { id: 'u', kind: 'custom', code: 'x' }], 1)).toBe(false)
    expect(canRePick([nav, assert('urlIncludes', '/')], 1)).toBe(true)
    expect(
      canRePick([nav, { id: 'a2', kind: 'assert', check: 'titleEquals', expected: 'T' }], 1)
    ).toBe(false)
  })
})
