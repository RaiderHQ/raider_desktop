import { describe, it, expect } from 'vitest'
import { isStep } from '../src/shared/types/step'

const el = { strategy: 'css', value: '#a' }

describe('isStep', () => {
  it.each([
    { id: '1', kind: 'navigate', url: 'http://x' },
    { id: '1', kind: 'click', element: el },
    { id: '1', kind: 'type', element: el, text: 'hi' },
    { id: '1', kind: 'type', element: el, text: '', secret: true },
    { id: '1', kind: 'type', element: el, text: '', secret: true, secretName: 'ADMIN_PW' },
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
    { id: '1', kind: 'type', element: el, text: 'x', secretName: 'ADMIN_PW' },
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
