import { describe, it, expect } from 'vitest'
import { renderStep } from '../../../src/main/codegen/steps'
import { migrateLegacyStep, migrateLegacyTest } from '../../../src/main/codegen/legacy'
import { isStep } from '../../../src/shared/types/step'
import type { ElementTarget, Locator, Step } from '../../../src/shared/types/step'
import { labelXPath, roleXPath, testIdCss, textXPath } from '../../../src/shared/locatorSelectors'

const css = (value: string): { strategy: 'css'; value: string } => ({
  strategy: 'css' as const,
  value
})
const id = (value: string): { strategy: 'id'; value: string } => ({
  strategy: 'id' as const,
  value
})
const xp = (value: string): { strategy: 'xpath'; value: string } => ({
  strategy: 'xpath' as const,
  value
})

// The 4.0 keyword forms carry the semantic locator the renderer wrote them from
const kwId = (value: string): ElementTarget => ({ ...id(value), locator: { by: 'id', value } })
const kwCss = (value: string): ElementTarget => ({
  ...css(value),
  locator: { by: 'css', value, positional: false }
})
const kwXp = (value: string): ElementTarget => ({ ...xp(value), locator: { by: 'xpath', value } })
const role = (role: string, name: string): ElementTarget => ({
  strategy: 'xpath',
  value: roleXPath(role, name, null)!,
  locator: { by: 'role', role, name }
})
const label = (text: string): ElementTarget => ({
  strategy: 'xpath',
  value: labelXPath(text),
  locator: { by: 'label', text }
})
const text = (text: string): ElementTarget => ({
  strategy: 'xpath',
  value: textXPath(text),
  locator: { by: 'text', text }
})
const testId = (value: string): ElementTarget => ({
  strategy: 'css',
  value: testIdCss('data-testid', value),
  locator: { by: 'testId', attribute: 'data-testid', value }
})

const strip = (s: Step): Omit<Step, 'id'> => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id: _id, ...rest } = s
  return rest
}

const cases: Array<[string, string, unknown]> = [
  ['navigate', '@driver.get("https://a.com")', { kind: 'navigate', url: 'https://a.com' }],
  [
    'click css with comment',
    '@driver.find_element(:css, "#a .b").click # Clicked <button>',
    { kind: 'click', element: css('#a .b') }
  ],
  ['click id', '@driver.find_element(:id, "go").click', { kind: 'click', element: id('go') }],
  [
    'click xpath single-quoted',
    '@driver.find_element(:xpath, \'//a[@id="x"]\').click',
    { kind: 'click', element: xp('//a[@id="x"]') }
  ],
  [
    'click xpath double-quoted',
    '@driver.find_element(:xpath, "//a[text()=\'x\']").click',
    { kind: 'click', element: xp("//a[text()='x']") }
  ],
  [
    'click xpath %q',
    '@driver.find_element(:xpath, %q(//a[@id="x"])).click',
    { kind: 'click', element: xp('//a[@id="x"]') }
  ],
  [
    'click without colon, escaped quote',
    '@driver.find_element(css, "a[href=\\"x\\"]").click',
    { kind: 'click', element: css('a[href="x"]') }
  ],
  [
    'type',
    '@driver.find_element(:id, "q").send_keys("he said \\"hi\\" \\\\")',
    { kind: 'type', element: id('q'), text: 'he said "hi" \\' }
  ],
  [
    'type xpath',
    '@driver.find_element(:xpath, \'//input\').send_keys("abc")',
    { kind: 'type', element: xp('//input'), text: 'abc' }
  ],
  [
    'pressKey enter',
    '@driver.find_element(:css, "#q").send_keys(:enter) # Pressed Enter on <input>',
    { kind: 'pressKey', element: css('#q'), key: 'Enter' }
  ],
  [
    'pressKey return',
    '@driver.find_element(:css, "#q").send_keys(:return)',
    { kind: 'pressKey', element: css('#q'), key: 'Enter' }
  ],
  [
    'pressKey arrow_up',
    '@driver.find_element(:css, "#q").send_keys(:arrow_up)',
    { kind: 'pressKey', element: css('#q'), key: 'ArrowUp' }
  ],
  [
    'pressKey f5',
    '@driver.find_element(:css, "#q").send_keys(:f5)',
    { kind: 'pressKey', element: css('#q'), key: 'F5' }
  ],
  [
    'pressKey escape/tab',
    '@driver.find_element(:css, "#q").send_keys(:escape)',
    { kind: 'pressKey', element: css('#q'), key: 'Escape' }
  ],
  [
    'wait displayed',
    'wait.until { @driver.find_element(:css, "#a").displayed? }',
    { kind: 'wait', element: css('#a'), until: 'visible' }
  ],
  [
    'wait enabled',
    "@wait.until { @driver.find_element(:xpath, '//b').enabled? }",
    { kind: 'wait', element: xp('//b'), until: 'enabled' }
  ],
  [
    'wait hidden',
    '@wait.until { !@driver.find_element(:id, "spin").displayed? }',
    { kind: 'wait', element: id('spin'), until: 'hidden' }
  ],
  ['switch default', '@driver.switch_to.default_content', { kind: 'switchFrame' }],
  [
    'switch frame element',
    '@driver.switch_to.frame(@driver.find_element(:id, "f"))',
    { kind: 'switchFrame', element: id('f') }
  ],
  [
    'assert displayed',
    'expect(@driver.find_element(:css, ".a")).to be_displayed',
    { kind: 'assert', check: 'displayed', element: css('.a') }
  ],
  [
    'assert not displayed',
    'expect(@driver.find_element(:css, ".a")).not_to be_displayed',
    { kind: 'assert', check: 'notDisplayed', element: css('.a') }
  ],
  [
    'assert enabled',
    "expect(@driver.find_element(:xpath, '//a')).to be_enabled",
    { kind: 'assert', check: 'enabled', element: xp('//a') }
  ],
  [
    'assert checked',
    'expect(@driver.find_element(:id, "c")).to be_selected',
    { kind: 'assert', check: 'checked', element: id('c') }
  ],
  [
    'assert text equals',
    'expect(@driver.find_element(:id, "t").text).to eq("Hi")',
    { kind: 'assert', check: 'textEquals', element: id('t'), expected: 'Hi' }
  ],
  [
    'assert text includes',
    'expect(@driver.find_element(:id, "t").text).to include("H")',
    { kind: 'assert', check: 'textIncludes', element: id('t'), expected: 'H' }
  ],
  [
    'assert value',
    'expect(@driver.find_element(:id, "t").attribute("value")).to eq("v")',
    { kind: 'assert', check: 'valueEquals', element: id('t'), expected: 'v' }
  ],
  [
    'assert title',
    'expect(@driver.title).to eq("Home")',
    { kind: 'assert', check: 'titleEquals', expected: 'Home' }
  ],
  [
    'assert url',
    'expect(@driver.current_url).to include("/x")',
    { kind: 'assert', check: 'urlIncludes', expected: '/x' }
  ]
]

describe('migrateLegacyStep', () => {
  it.each(cases)('%s', (_name, code, expected) => {
    const step = migrateLegacyStep(code)
    expect(isStep(step)).toBe(true)
    expect(strip(step)).toEqual(expected)
  })

  it('collapses the multi-line clear + send_keys form into one type step', () => {
    const code =
      '@driver.find_element(:css, "#q").clear\n    @driver.find_element(:css, "#q").send_keys("hello")'
    const step = migrateLegacyStep(code)
    expect(isStep(step)).toBe(true)
    expect(strip(step)).toEqual({ kind: 'type', element: css('#q'), text: 'hello' })
  })

  it.each([
    ['unknown line', 'browser.element(id: "x").click'],
    ['sleep', 'sleep(2)'],
    ['execute_script', '@driver.execute_script("window.scrollTo(0,0)")'],
    ['unsupported strategy', '@driver.find_element(:name, "q").click'],
    ['class_name', '@driver.find_element(:class_name, "q").send_keys("x")'],
    ['link_text assert', 'expect(@driver.find_element(:link_text, "q")).to be_displayed'],
    ['unknown key', '@driver.find_element(:css, "#q").send_keys(:bogus)'],
    ['lone clear', '@driver.find_element(:css, "#q").clear'],
    ['!enabled wait', 'wait.until { !@driver.find_element(:id, "a").enabled? }'],
    ['frame by index', '@driver.switch_to.frame(0)']
  ])('%s becomes custom with the code unchanged', (_n, code) => {
    const step = migrateLegacyStep(code)
    expect(isStep(step)).toBe(true)
    expect(strip(step)).toEqual({ kind: 'custom', code })
  })

  it('does not collapse clear + send_keys on different elements', () => {
    const code =
      '@driver.find_element(:css, "#a").clear\n@driver.find_element(:css, "#b").send_keys("x")'
    expect(strip(migrateLegacyStep(code))).toEqual({ kind: 'custom', code })
  })
})

describe('migrateLegacyTest', () => {
  it('names unnamed secret steps once when a test is loaded', () => {
    const pw = { strategy: 'id', value: 'pw' }
    const test = migrateLegacyTest({
      id: 't',
      name: 'T',
      url: '',
      steps: [
        { id: 'a', kind: 'type', element: pw, text: '', secret: true },
        {
          id: 'b',
          kind: 'type',
          element: pw,
          text: '',
          secret: true,
          secretName: 'RAIDER_SECRET_1'
        }
      ]
    })
    expect(test.steps).toMatchObject([
      { id: 'a', secretName: 'RAIDER_SECRET_2' },
      { id: 'b', secretName: 'RAIDER_SECRET_1' }
    ])
  })

  it('treats missing or non-array steps as no steps', () => {
    expect(migrateLegacyTest({ id: 't', name: 'n', url: 'u' }).steps).toEqual([])
    expect(migrateLegacyTest({ id: 't', name: 'n', url: 'u', steps: 'oops' }).steps).toEqual([])
    expect(migrateLegacyTest({ id: 't', name: 'n', url: 'u', steps: null }).steps).toEqual([])
  })

  it('collapses separate clear and send_keys strings and keeps other fields', () => {
    const test = migrateLegacyTest({
      id: 't1',
      name: 'n',
      url: 'u',
      hasTrace: true,
      steps: [
        '@driver.get("https://a.com")',
        '@driver.find_element(:id, "q").clear',
        '@driver.find_element(:id, "q").send_keys("x")',
        '@driver.find_element(:id, "q").send_keys(:enter)'
      ]
    })
    expect(test.id).toBe('t1')
    expect(test.hasTrace).toBe(true)
    expect(test.steps.every(isStep)).toBe(true)
    expect(test.steps.map(strip)).toEqual([
      { kind: 'navigate', url: 'https://a.com' },
      { kind: 'type', element: id('q'), text: 'x' },
      { kind: 'pressKey', element: id('q'), key: 'Enter' }
    ])
  })

  it('passes existing Step objects through unchanged and migrates only strings', () => {
    const existing: Step = { id: 'keep', kind: 'click', element: css('#a') }
    const test = migrateLegacyTest({
      id: 't',
      name: 'n',
      url: 'u',
      steps: [existing, '@driver.get("x")', 'browser.element(id: "x").click']
    })
    expect(test.steps[0]).toBe(existing)
    expect(test.steps[1]).toMatchObject({ kind: 'navigate', url: 'x' })
    expect(test.steps[2]).toMatchObject({ kind: 'custom', code: 'browser.element(id: "x").click' })
    expect(test.steps.every(isStep)).toBe(true)
  })

  it('assigns unique ids', () => {
    const t = migrateLegacyTest({
      id: 't',
      name: 'n',
      url: 'u',
      steps: ['@driver.get("a")', '@driver.get("a")']
    })
    expect(new Set(t.steps.map((s) => s.id)).size).toBe(2)
  })
})

// Verbatim output of the removed recorder generator (frameworkTemplates.generateSeleniumCommand)
describe('migrates the old recorder output', () => {
  it('type, click, key, xpath', () => {
    const type = migrateLegacyStep(
      `@driver.find_element(:xpath, '//a[@x="1"]/b').clear\n` +
        `    @driver.find_element(:xpath, '//a[@x="1"]/b').send_keys("hi")`
    )
    expect(strip(type)).toEqual({ kind: 'type', element: xp('//a[@x="1"]/b'), text: 'hi' })
    const click = migrateLegacyStep('@driver.find_element(:css, "#a").click # Clicked <input>')
    expect(strip(click)).toEqual({ kind: 'click', element: css('#a') })
    const key = migrateLegacyStep(
      '@driver.find_element(:id, "q").send_keys(:arrow_down) # Pressed ArrowDown on <input>'
    )
    expect(strip(key)).toEqual({ kind: 'pressKey', element: id('q'), key: 'ArrowDown' })
  })
})

describe('helper receiver', () => {
  it('helper receiver parses back', () => {
    const click = migrateLegacyStep("driver.find_element(id: 'a').click")
    expect(strip(click)).toEqual({ kind: 'click', element: kwId('a') })
    const wait = migrateLegacyStep("wait.until { driver.find_element(css: '.x').displayed? }")
    expect(strip(wait)).toEqual({ kind: 'wait', element: kwCss('.x'), until: 'visible' })
  })
})

describe('escaped selector values round-trip', () => {
  it.each(['a\\:b', "it's", "a\\'b", '#x\\\\y'])('value %s', (value) => {
    for (const receiver of ['ivar', 'helper'] as const) {
      const step: Step = { id: '1', kind: 'click', element: css(value) }
      const code = renderStep(step, { receiver }).split('\n').pop()!
      // The keyword form is the same whether or not the step carried a css locator
      expect(strip(migrateLegacyStep(code))).toEqual({ kind: 'click', element: kwCss(value) })
    }
  })
})

// The lines steps.ts renders for the ruby_raider 4.0 runtime
describe('migrateLegacyStep: 4.0 shapes', () => {
  const loginButton = role('button', 'Login')
  const newCases: Array<[string, string, unknown]> = [
    ['navigate', "driver.navigate.to('https://a.com')", { kind: 'navigate', url: 'https://a.com' }],
    [
      'navigate ivar',
      "@driver.navigate.to('https://a.com')",
      { kind: 'navigate', url: 'https://a.com' }
    ],
    [
      'click role',
      "driver.find_element(by_role('button', name: 'Login', exact: true)).click",
      { kind: 'click', element: loginButton }
    ],
    [
      'click role double-quoted',
      'driver.find_element(by_role("heading", name: "Billing", exact: true)).click',
      { kind: 'click', element: role('heading', 'Billing') }
    ],
    [
      'click label exact',
      "driver.find_element(label: ['Login name', { exact: true }]).click",
      { kind: 'click', element: label('Login name') }
    ],
    [
      'click text exact',
      "driver.find_element(text: ['Sign in', { exact: true }]).click",
      { kind: 'click', element: text('Sign in') }
    ],
    [
      'click text with both quotes',
      `driver.find_element(text: ['Say "hi" if it\\'s you', { exact: true }]).click`,
      { kind: 'click', element: text(`Say "hi" if it's you`) }
    ],
    [
      'click test id',
      "driver.find_element(test_id: 'submit').click",
      { kind: 'click', element: testId('submit') }
    ],
    ['click id', "driver.find_element(id: 'go').click", { kind: 'click', element: kwId('go') }],
    [
      'click css',
      "driver.find_element(css: 'a[href=\\'x\\']').click",
      { kind: 'click', element: kwCss("a[href='x']") }
    ],
    [
      'click xpath',
      'driver.find_element(xpath: \'//a[@id="x"]\').click',
      { kind: 'click', element: kwXp('//a[@id="x"]') }
    ],
    [
      'send_keys single line',
      "driver.find_element(label: ['Email', { exact: true }]).send_keys('a@b.c')",
      { kind: 'type', element: label('Email'), text: 'a@b.c' }
    ],
    [
      'pressKey enter on role',
      "driver.find_element(by_role('textbox', name: 'Search', exact: true)).send_keys(:enter)",
      { kind: 'pressKey', element: role('textbox', 'Search'), key: 'Enter' }
    ],
    [
      'pressKey space on test id',
      "driver.find_element(test_id: 'q').send_keys(:space)",
      { kind: 'pressKey', element: testId('q'), key: ' ' }
    ],
    [
      'assert visible',
      "expect { driver.find_element(by_role('button', name: 'Login', exact: true)) }.to be_visible",
      { kind: 'assert', check: 'displayed', element: loginButton }
    ],
    [
      'assert hidden',
      "expect { driver.find_element(text: ['Loading', { exact: true }]) }.to be_hidden",
      { kind: 'assert', check: 'notDisplayed', element: text('Loading') }
    ],
    [
      'assert enabled',
      "expect { driver.find_element(test_id: 'go') }.to be_enabled",
      { kind: 'assert', check: 'enabled', element: testId('go') }
    ],
    [
      'assert checked',
      "expect { driver.find_element(label: ['Remember me', { exact: true }]) }.to be_checked",
      { kind: 'assert', check: 'checked', element: label('Remember me') }
    ],
    [
      'assert text equals',
      "expect { driver.find_element(id: 't') }.to have_text('Hi', exact: true)",
      { kind: 'assert', check: 'textEquals', element: kwId('t'), expected: 'Hi' }
    ],
    [
      'assert text includes',
      "expect { driver.find_element(css: '.t') }.to have_text('H')",
      { kind: 'assert', check: 'textIncludes', element: kwCss('.t'), expected: 'H' }
    ],
    [
      'assert value',
      "expect { @driver.find_element(xpath: '//input') }.to have_value('v')",
      { kind: 'assert', check: 'valueEquals', element: kwXp('//input'), expected: 'v' }
    ],
    [
      'assert text escaped',
      "expect { driver.find_element(id: 't') }.to have_text('it\\'s \\\\ ok')",
      { kind: 'assert', check: 'textIncludes', element: kwId('t'), expected: "it's \\ ok" }
    ],
    [
      'assert title',
      "expect(driver).to have_title('Home')",
      { kind: 'assert', check: 'titleEquals', expected: 'Home' }
    ],
    [
      'assert url',
      "expect { driver.current_url }.to include('/x')",
      { kind: 'assert', check: 'urlIncludes', expected: '/x' }
    ],
    ['switch default', 'driver.switch_to.default_content', { kind: 'switchFrame' }],
    [
      'switch frame role',
      "driver.switch_to.frame(driver.find_element(by_role('button', name: 'Login', exact: true)))",
      { kind: 'switchFrame', element: loginButton }
    ],
    [
      'switch frame test id',
      "driver.switch_to.frame(driver.find_element(test_id: 'f'))",
      { kind: 'switchFrame', element: testId('f') }
    ]
  ]

  it.each(newCases)('%s', (_name, code, expected) => {
    const step = migrateLegacyStep(code)
    expect(isStep(step)).toBe(true)
    expect(strip(step)).toEqual(expected)
  })

  it('collapses the two-line clear + send_keys form on a semantic locator', () => {
    const find = "driver.find_element(by_role('textbox', name: 'Email', exact: true))"
    const step = migrateLegacyStep(`${find}.clear\n${find}.send_keys('a@b.c')`)
    expect(isStep(step)).toBe(true)
    expect(strip(step)).toEqual({ kind: 'type', element: role('textbox', 'Email'), text: 'a@b.c' })
  })

  it('collapses separate clear and send_keys strings in a test', () => {
    const test = migrateLegacyTest({
      id: 't',
      name: 'n',
      url: 'u',
      steps: [
        "driver.find_element(label: ['Email', { exact: true }]).clear",
        "driver.find_element(label: ['Email', { exact: true }]).send_keys('x')",
        "driver.find_element(label: ['Email', { exact: true }]).send_keys(:enter)"
      ]
    })
    expect(test.steps.map(strip)).toEqual([
      { kind: 'type', element: label('Email'), text: 'x' },
      { kind: 'pressKey', element: label('Email'), key: 'Enter' }
    ])
  })

  it.each([
    ['unknown role', "driver.find_element(by_role('tab', name: 'Home', exact: true)).click"],
    [
      'substring role name',
      "driver.find_element(by_role('button', name: 'Lo', exact: false)).click"
    ],
    ['substring label', "driver.find_element(label: ['Login', { exact: false }]).click"],
    // The plain forms are substring matches on 4.0, which no Locator describes
    ['plain label', "driver.find_element(label: 'Login name').click"],
    ['plain text', "driver.find_element(text: 'Sign in').click"],
    [
      'role without exact',
      "@driver.find_element(by_role('link', name: 'Pricing')).click # Clicked <a>"
    ],
    ['empty label', "driver.find_element(label: '').click"],
    ['empty test id', "driver.find_element(test_id: '').click"],
    ['unknown keyword', "driver.find_element(name: 'q').click"],
    ['secret type', "driver.find_element(id: 'pw').send_keys(ENV.fetch('RAIDER_SECRET_1'))"],
    ['have_url', "expect(driver).to have_url('x')"],
    ['lone clear', "driver.find_element(test_id: 'q').clear"]
  ])('%s becomes custom with the code unchanged', (_n, code) => {
    const step = migrateLegacyStep(code)
    expect(isStep(step)).toBe(true)
    expect(strip(step)).toEqual({ kind: 'custom', code })
  })

  it('does not collapse clear + send_keys on different semantic locators', () => {
    const code =
      "driver.find_element(label: 'a').clear\ndriver.find_element(label: 'b').send_keys('x')"
    expect(strip(migrateLegacyStep(code))).toEqual({ kind: 'custom', code })
  })
})

describe('renderStep -> migrateLegacyStep round trip', () => {
  // A plain id/css/xpath locator is stored as its own fallback; a semantic one carries
  // whatever the recorder resolved on the page
  const el = (locator: Locator, strategy: ElementTarget['strategy'] = 'xpath'): ElementTarget => ({
    strategy,
    value: 'value' in locator && locator.by !== 'testId' ? locator.value : 'recorded-fallback',
    locator
  })
  const button = el({ by: 'role', role: 'button', name: 'Login' })
  const email = el({ by: 'label', text: 'Email address' })
  const signIn = el({ by: 'text', text: 'Don\'t "panic"' })
  const submit = el({ by: 'testId', attribute: 'data-testid', value: 'submit' }, 'css')
  const byId = el({ by: 'id', value: 'go' }, 'id')
  const byCss = el({ by: 'css', value: 'form > input', positional: false }, 'css')
  const byXp = el({ by: 'xpath', value: '//a[@id="x"]' }, 'xpath')

  const steps: Step[] = [
    { id: 'x', kind: 'navigate', url: "https://a.com/?q=it's" },
    { id: 'x', kind: 'click', element: button },
    { id: 'x', kind: 'click', element: signIn },
    { id: 'x', kind: 'type', element: email, text: "a'b\\c" },
    { id: 'x', kind: 'pressKey', element: button, key: 'Enter' },
    { id: 'x', kind: 'pressKey', element: email, key: 'ArrowDown' },
    { id: 'x', kind: 'assert', check: 'displayed', element: button },
    { id: 'x', kind: 'assert', check: 'notDisplayed', element: signIn },
    { id: 'x', kind: 'assert', check: 'enabled', element: submit },
    { id: 'x', kind: 'assert', check: 'checked', element: byId },
    { id: 'x', kind: 'assert', check: 'textEquals', element: byCss, expected: 'Hi' },
    { id: 'x', kind: 'assert', check: 'textIncludes', element: byXp, expected: 'H' },
    { id: 'x', kind: 'assert', check: 'valueEquals', element: email, expected: 'v' },
    { id: 'x', kind: 'assert', check: 'titleEquals', expected: 'Home' },
    { id: 'x', kind: 'assert', check: 'urlIncludes', expected: '/x' },
    { id: 'x', kind: 'switchFrame', element: submit },
    { id: 'x', kind: 'switchFrame' }
  ]

  // A plain id/css/xpath locator is its own fallback; the others are re-synthesised, so
  // only the locator and strategy are compared (the value is checked to be present)
  const comparable = (element: ElementTarget): unknown => {
    const by = element.locator?.by
    return by === 'role' || by === 'label' || by === 'text' || by === 'testId'
      ? { strategy: element.strategy, locator: element.locator }
      : element
  }
  const elementOf = (s: Step): ElementTarget | undefined => ('element' in s ? s.element : undefined)
  const normalize = (s: Step): unknown => {
    const element = elementOf(s)
    return element ? { ...strip(s), element: comparable(element) } : strip(s)
  }

  it.each(
    steps.map((s): [string, Step] => [s.kind + (s.kind === 'assert' ? ` ${s.check}` : ''), s])
  )('%s', (_name, step) => {
    const code = renderStep(step, { receiver: 'helper' })
    const back = migrateLegacyStep(code)
    expect(isStep(back)).toBe(true)
    const element = elementOf(back)
    if (elementOf(step)) {
      expect(element?.value).toEqual(expect.any(String))
      expect(element?.value).not.toBe('')
    }
    expect(normalize(back)).toEqual(normalize(step))
  })

  it('a plain id/css/xpath step round-trips to the same step with its locator', () => {
    for (const element of [byId, byCss, byXp]) {
      const step: Step = { id: 'x', kind: 'click', element }
      const back = migrateLegacyStep(renderStep(step, { receiver: 'helper' }))
      expect(strip(back)).toEqual(strip(step))
    }
  })
})
