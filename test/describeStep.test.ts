import { describeStep, foundBy } from '@shared/describeStep'
import { englishText } from '@shared/describeStepEnglish'
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

  it('says "this element" when there is no label and no locator, never a raw selector', () => {
    expect(describeStep({ id, kind: 'click', element: bare })).toEqual({
      key: 'recorder.commandParser.clickElement',
      values: { element: 'this element' }
    })
    const xp: ElementTarget = { strategy: 'xpath', value: '//div[2]/a' }
    const { values } = describeStep({ id, kind: 'click', element: xp })
    expect(JSON.stringify(values)).not.toMatch(/css=|xpath=|id=/)
  })

  it('falls back to the locator name when there is no label', () => {
    const el = (locator: ElementTarget['locator']): ElementTarget => ({ ...bare, locator })
    const name = (l: ElementTarget['locator']): string =>
      describeStep({ id, kind: 'click', element: el(l) }).values.element
    expect(name({ by: 'role', role: 'button', name: 'Save' })).toBe('Save')
    expect(name({ by: 'label', text: 'Email' })).toBe('Email')
    expect(name({ by: 'text', text: 'Welcome' })).toBe('Welcome')
    expect(name({ by: 'testId', attribute: 'data-testid', value: 'save-btn' })).toBe('save-btn')
    expect(name({ by: 'css', value: '.a', positional: true })).toBe('this element')
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
      values: { element: 'this element', key: 'Enter' }
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
      values: { element: 'this element', text: 'Hi' }
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
      values: { element: 'this element' }
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

describe('foundBy', () => {
  const el = (locator: ElementTarget['locator'], strategy: ElementTarget['strategy'] = 'css') =>
    ({ strategy, value: 'x', locator }) as ElementTarget
  const text = (e: ElementTarget): string | null => {
    const f = foundBy(e)
    return f && englishText(f.key, f.values)
  }

  it('returns null without an element', () => {
    expect(foundBy(undefined)).toBeNull()
  })

  it.each([
    [{ by: 'role', role: 'button', name: 'Save' }, 'Found by role · button "Save"', false],
    [{ by: 'role', role: 'textbox', name: 'Email' }, 'Found by role · text box "Email"', false],
    [{ by: 'role', role: 'radio', name: 'Red' }, 'Found by role · radio button "Red"', false],
    [{ by: 'role', role: 'combobox', name: 'Country' }, 'Found by role · dropdown "Country"', false],
    [{ by: 'role', role: 'tab', name: 'Home' }, 'Found by role · tab "Home"', false],
    [{ by: 'label', text: 'Email' }, 'Found by label · "Email"', false],
    [{ by: 'testId', attribute: 'data-qa', value: 'save' }, 'Found by test id · save', false],
    [{ by: 'text', text: 'Hello' }, 'Found by text · "Hello"', false],
    [{ by: 'id', value: 'login' }, 'Found by id', false],
    [{ by: 'css', value: '.a', positional: false }, 'Found by CSS', false],
    [{ by: 'css', value: '.a > b:nth-child(2)', positional: true }, 'Found by CSS', true],
    [{ by: 'xpath', value: '//a' }, 'Found by XPath', true]
  ] as const)('describes %j', (locator, expected, weak) => {
    expect(text(el(locator))).toBe(expected)
    expect(foundBy(el(locator))?.weak).toBe(weak)
  })

  it('describes older steps that have no locator', () => {
    expect(text(el(undefined, 'css'))).toBe('Found by CSS (older recording)')
    expect(foundBy(el(undefined, 'css'))?.weak).toBe(true)
    expect(text(el(undefined, 'xpath'))).toBe('Found by XPath (older recording)')
    expect(foundBy(el(undefined, 'xpath'))?.weak).toBe(true)
    expect(text(el(undefined, 'id'))).toBe('Found by id')
    expect(foundBy(el(undefined, 'id'))?.weak).toBe(false)
  })
})
