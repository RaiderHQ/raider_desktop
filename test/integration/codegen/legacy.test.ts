import { describe, it, expect } from 'vitest'
import { renderStep } from '../../../src/main/codegen/steps'
import { migrateLegacyStep, migrateLegacyTest } from '../../../src/main/codegen/legacy'
import { isStep } from '../../../src/shared/types/step'
import type { Step } from '../../../src/shared/types/step'

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
    expect(strip(click)).toEqual({ kind: 'click', element: id('a') })
    const wait = migrateLegacyStep("wait.until { driver.find_element(css: '.x').displayed? }")
    expect(strip(wait)).toEqual({ kind: 'wait', element: css('.x'), until: 'visible' })
  })
})

describe('escaped selector values round-trip', () => {
  it.each(['a\\:b', "it's", "a\\'b", '#x\\\\y'])('value %s', (value) => {
    for (const receiver of ['ivar', 'helper'] as const) {
      const step: Step = { id: '1', kind: 'click', element: css(value) }
      const code = renderStep(step, 'selenium', { receiver }).split('\n').pop()!
      expect(strip(migrateLegacyStep(code))).toEqual({ kind: 'click', element: css(value) })
    }
  })
})
