import { describeStep } from '@shared/describeStep'
import type { ElementTarget } from '@shared/types/step'

const labelled: ElementTarget = { strategy: 'id', value: 'login', label: 'Log in' }
const bare: ElementTarget = { strategy: 'css', value: '.btn' }
const id = 's1'

describe('describeStep', () => {
  it('describes navigate', () => {
    expect(describeStep({ id, kind: 'navigate', url: 'https://x.test' })).toEqual({
      key: 'recorder.commandParser.visit',
      values: { url: 'https://x.test' }
    })
  })

  it('shows the label for a labelled element', () => {
    expect(describeStep({ id, kind: 'click', element: labelled })).toEqual({
      key: 'recorder.commandParser.clickElement',
      values: { element: 'Log in' }
    })
  })

  it('shows strategy=value when there is no label', () => {
    expect(describeStep({ id, kind: 'click', element: bare })).toEqual({
      key: 'recorder.commandParser.clickElement',
      values: { element: 'css=.btn' }
    })
  })

  it('describes type', () => {
    expect(describeStep({ id, kind: 'type', element: labelled, text: 'bob' })).toEqual({
      key: 'recorder.commandParser.typeText',
      values: { element: 'Log in', text: 'bob' }
    })
  })

  it('describes a secret type step by where its value comes from, never by a value', () => {
    expect(
      describeStep({
        id,
        kind: 'type',
        element: labelled,
        text: '',
        secret: true,
        secretName: 'RAIDER_SECRET_2'
      })
    ).toEqual({
      key: 'recorder.commandParser.typeSecret',
      values: { element: 'Log in', name: 'RAIDER_SECRET_2' }
    })
  })

  it('describes pressKey, naming the space bar', () => {
    expect(describeStep({ id, kind: 'pressKey', element: bare, key: 'Enter' })).toEqual({
      key: 'recorder.commandParser.pressKey',
      values: { element: 'css=.btn', key: 'Enter' }
    })
    expect(describeStep({ id, kind: 'pressKey', element: bare, key: ' ' }).values.key).toBe('Space')
  })

  it.each([
    ['visible', 'recorder.commandParser.waitForElementDisplayed'],
    ['hidden', 'recorder.commandParser.waitForElementDisappear'],
    ['enabled', 'recorder.commandParser.waitForElementEnabled']
  ] as const)('describes wait until %s', (until, key) => {
    expect(describeStep({ id, kind: 'wait', element: labelled, until })).toEqual({
      key,
      values: { element: 'Log in' }
    })
  })

  it.each([
    ['displayed', 'assertElementDisplayed'],
    ['notDisplayed', 'assertElementNotDisplayed'],
    ['enabled', 'assertElementEnabled'],
    ['checked', 'assertElementChecked']
  ] as const)('describes the %s assertion', (check, key) => {
    expect(describeStep({ id, kind: 'assert', check, element: labelled })).toEqual({
      key: `recorder.commandParser.${key}`,
      values: { element: 'Log in' }
    })
  })

  it.each([
    ['textEquals', 'assertElementTextEquals'],
    ['textIncludes', 'assertElementTextIncludes'],
    ['valueEquals', 'assertElementValue']
  ] as const)('describes the %s assertion with its expected text', (check, key) => {
    expect(describeStep({ id, kind: 'assert', check, element: bare, expected: 'Hi' })).toEqual({
      key: `recorder.commandParser.${key}`,
      values: { element: 'css=.btn', text: 'Hi' }
    })
  })

  it('describes page title and url assertions', () => {
    expect(describeStep({ id, kind: 'assert', check: 'titleEquals', expected: 'Home' })).toEqual({
      key: 'recorder.commandParser.assertPageTitle',
      values: { title: 'Home' }
    })
    expect(describeStep({ id, kind: 'assert', check: 'urlIncludes', expected: '/a' })).toEqual({
      key: 'recorder.commandParser.assertUrlContains',
      values: { url: '/a' }
    })
  })

  it('describes switching into and out of a frame', () => {
    expect(describeStep({ id, kind: 'switchFrame', element: bare })).toEqual({
      key: 'recorder.commandParser.switchToFrame',
      values: { element: 'css=.btn' }
    })
    expect(describeStep({ id, kind: 'switchFrame' })).toEqual({
      key: 'recorder.commandParser.switchToDefaultContent',
      values: {}
    })
  })

  it('never exposes Ruby for custom steps', () => {
    expect(describeStep({ id, kind: 'custom', code: '@driver.quit' })).toEqual({
      key: 'recorder.step.custom',
      values: {}
    })
  })

  it('describes an unknown kind as a custom step instead of crashing', () => {
    const future = { id, kind: 'hover', element: bare } as unknown as Parameters<
      typeof describeStep
    >[0]
    expect(describeStep(future)).toEqual({ key: 'recorder.step.custom', values: {} })
  })

  it('has an English string for every key it can produce', async () => {
    const en = (await import('@assets/translations/en.json')).default as Record<string, unknown>
    const lookup = (key: string): unknown =>
      key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], en)
    const steps = [
      { id, kind: 'navigate', url: 'u' },
      { id, kind: 'click', element: bare },
      { id, kind: 'type', element: bare, text: 't' },
      { id, kind: 'pressKey', element: bare, key: 'Tab' },
      { id, kind: 'wait', element: bare, until: 'visible' },
      { id, kind: 'wait', element: bare, until: 'hidden' },
      { id, kind: 'wait', element: bare, until: 'enabled' },
      ...(
        [
          'displayed',
          'notDisplayed',
          'enabled',
          'checked',
          'textEquals',
          'textIncludes',
          'valueEquals'
        ] as const
      ).map((check) => ({ id, kind: 'assert', check, element: bare, expected: 'x' })),
      { id, kind: 'assert', check: 'titleEquals', expected: 'x' },
      { id, kind: 'assert', check: 'urlIncludes', expected: 'x' },
      { id, kind: 'switchFrame', element: bare },
      { id, kind: 'switchFrame' },
      { id, kind: 'custom', code: 'x' }
    ] as Parameters<typeof describeStep>[0][]
    for (const step of steps) {
      expect(typeof lookup(describeStep(step).key), describeStep(step).key).toBe('string')
    }
    expect(lookup('recorder.step.custom')).toBe('Custom code step')
  })
})
