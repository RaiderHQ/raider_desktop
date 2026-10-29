import { buildAssertionStep, assertionModalType } from '@foundation/assertionStep'
import { isStep } from '@shared/types/step'
import type { ElementTarget } from '@shared/types/step'

const el: ElementTarget = { strategy: 'id', value: 'greeting', label: 'Greeting' }

describe('buildAssertionStep', () => {
  it('builds a text-includes assertion with the expected text', () => {
    const step = buildAssertionStep('textIncludes', el, 'Hi')
    expect(step).toEqual({
      id: expect.any(String),
      kind: 'assert',
      check: 'textIncludes',
      element: el,
      expected: 'Hi'
    })
    expect(isStep(step)).toBe(true)
  })

  it('builds element-state assertions without an expected value', () => {
    const step = buildAssertionStep('displayed', el)
    expect(step).toEqual({
      id: expect.any(String),
      kind: 'assert',
      check: 'displayed',
      element: el
    })
    expect(isStep(step)).toBe(true)
  })

  it('builds page assertions without an element', () => {
    const step = buildAssertionStep('titleEquals', undefined, 'Home')
    expect(step).toEqual({
      id: expect.any(String),
      kind: 'assert',
      check: 'titleEquals',
      expected: 'Home'
    })
    expect(isStep(step)).toBe(true)
  })

  it('drops the element from page assertions', () => {
    expect(buildAssertionStep('urlIncludes', el, '/home')).not.toHaveProperty('element')
  })

  it('keeps an empty expected string', () => {
    expect(buildAssertionStep('valueEquals', el, '')).toMatchObject({ expected: '' })
  })

  it('gives every step a new id', () => {
    expect(buildAssertionStep('displayed', el).id).not.toBe(buildAssertionStep('displayed', el).id)
  })
})

describe('assertionModalType', () => {
  it('maps text-taking assertions to the modal copy keys', () => {
    expect(assertionModalType('textEquals')).toBe('text')
    expect(assertionModalType('textIncludes')).toBe('text-includes')
    expect(assertionModalType('valueEquals')).toBe('value')
    expect(assertionModalType('titleEquals')).toBe('page-title')
    expect(assertionModalType('urlIncludes')).toBe('page-url')
  })
})
