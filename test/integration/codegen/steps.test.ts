import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { findRuby } from './rubyBin'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { renderStep } from '../../../src/main/codegen/steps'
import type { Step, AssertKind, ElementTarget, Locator } from '../../../src/shared/types/step'

const css = (value: string): { strategy: 'css'; value: string } => ({
  strategy: 'css' as const,
  value
})
const id = (value: string): { strategy: 'id'; value: string } => ({
  strategy: 'id' as const,
  value
})

describe('renderStep table', () => {
  const rows: Array<[string, Step, string, string]> = [
    [
      'navigate',
      { id: '1', kind: 'navigate', url: 'https://x.io' },
      "@driver.navigate.to('https://x.io')",
      "@browser.goto('https://x.io')"
    ],
    [
      'click',
      { id: '1', kind: 'click', element: css('#a') },
      "@wait.until { @driver.find_element(css: '#a').displayed? }\n@driver.find_element(css: '#a').click",
      "@browser.element(css: '#a').click"
    ],
    [
      'type',
      { id: '1', kind: 'type', element: id('email'), text: "a'b" },
      "@wait.until { @driver.find_element(id: 'email').displayed? }\n@driver.find_element(id: 'email').clear\n@driver.find_element(id: 'email').send_keys('a\\'b')",
      "@browser.element(id: 'email').to_subtype.set('a\\'b')"
    ],
    [
      'pressKey',
      { id: '1', kind: 'pressKey', element: id('q'), key: 'Enter' },
      "@driver.find_element(id: 'q').send_keys(:enter)",
      "@browser.element(id: 'q').send_keys(:enter)"
    ],
    [
      'wait hidden',
      { id: '1', kind: 'wait', element: css('.spinner'), until: 'hidden' },
      "@wait.until { @driver.find_elements(css: '.spinner').none?(&:displayed?) }",
      "@browser.element(css: '.spinner').wait_while(&:present?)"
    ],
    [
      'wait visible',
      { id: '1', kind: 'wait', element: css('.a'), until: 'visible' },
      "@wait.until { @driver.find_element(css: '.a').displayed? }",
      "@browser.element(css: '.a').wait_until(&:present?)"
    ],
    [
      'wait enabled',
      { id: '1', kind: 'wait', element: css('.a'), until: 'enabled' },
      "@wait.until { @driver.find_element(css: '.a').enabled? }",
      "@browser.element(css: '.a').wait_until(&:enabled?)"
    ],
    [
      'assert textIncludes',
      { id: '1', kind: 'assert', check: 'textIncludes', element: css('h1'), expected: 'Hi' },
      "@wait.until { @driver.find_element(css: 'h1').text.include?('Hi') }\nexpect(@driver.find_element(css: 'h1').text).to include('Hi')",
      "@browser.element(css: 'h1').wait_until { |el| el.text.include?('Hi') }\nexpect(@browser.element(css: 'h1').text).to include('Hi')"
    ],
    [
      'assert titleEquals',
      { id: '1', kind: 'assert', check: 'titleEquals', expected: 'T' },
      "@wait.until { @driver.title == 'T' }\nexpect(@driver.title).to eq('T')",
      "@browser.wait_until { |b| b.title == 'T' }\nexpect(@browser.title).to eq('T')"
    ],
    [
      'switchFrame default',
      { id: '1', kind: 'switchFrame' },
      '@driver.switch_to.default_content',
      '@browser.wd.switch_to.default_content'
    ],
    ['custom', { id: '1', kind: 'custom', code: 'foo(1)' }, 'foo(1)', 'foo(1)']
  ]
  it.each(rows)('%s', (_n, step, sel, wat) => {
    expect(renderStep(step, 'selenium')).toBe(sel)
    expect(renderStep(step, 'watir')).toBe(wat)
  })
})

describe('renderStep secret type steps', () => {
  const secret: Step = { id: '1', kind: 'type', element: id('pw'), text: '', secret: true }
  const named: Step = { ...secret, secretName: 'RAIDER_SECRET_2' } as Step

  it('reads the value from the environment variable stored on the step', () => {
    expect(renderStep(named, 'selenium')).toBe(
      "@wait.until { @driver.find_element(id: 'pw').displayed? }\n@driver.find_element(id: 'pw').clear\n@driver.find_element(id: 'pw').send_keys(ENV.fetch('RAIDER_SECRET_2'))"
    )
    expect(renderStep(named, 'watir')).toBe(
      "@browser.element(id: 'pw').to_subtype.set(ENV.fetch('RAIDER_SECRET_2'))"
    )
  })

  it('refuses a secret step that has no variable yet', () => {
    expect(() => renderStep(secret, 'watir')).toThrow(/no variable/)
  })

  it.each(['GITHUB_TOKEN', 'RAIDER_TOKEN', 'RAIDER_SECRET'])(
    'refuses to read %s, which is not a RAIDER_SECRET_ variable',
    (secretName) => {
      const bad = { ...secret, secretName } as Step
      expect(() => renderStep(bad, 'selenium')).toThrow(/RAIDER_SECRET_/)
    }
  )

  it('reads RAIDER_SECRET_LOGIN', () => {
    expect(renderStep({ ...secret, secretName: 'RAIDER_SECRET_LOGIN' } as Step, 'watir')).toContain(
      "ENV.fetch('RAIDER_SECRET_LOGIN')"
    )
  })
})

describe('renderStep details', () => {
  const el = css('.x')
  const assertStep = (check: AssertKind, expected?: string): Step => ({
    id: '1',
    kind: 'assert',
    check,
    element: el,
    expected
  })

  it.each<[AssertKind, string | undefined, string, string]>([
    [
      'displayed',
      undefined,
      "@wait.until { @driver.find_element(css: '.x').displayed? }\nexpect(@driver.find_element(css: '.x')).to be_displayed",
      "@browser.element(css: '.x').wait_until(&:present?)\nexpect(@browser.element(css: '.x')).to be_present"
    ],
    [
      'notDisplayed',
      undefined,
      "@wait.until { @driver.find_elements(css: '.x').none?(&:displayed?) }\nexpect(@driver.find_elements(css: '.x').none?(&:displayed?)).to be(true)",
      "@browser.element(css: '.x').wait_while(&:present?)\nexpect(@browser.element(css: '.x')).not_to be_present"
    ],
    [
      'enabled',
      undefined,
      "@wait.until { @driver.find_element(css: '.x').enabled? }\nexpect(@driver.find_element(css: '.x')).to be_enabled",
      "@browser.element(css: '.x').wait_until(&:enabled?)\nexpect(@browser.element(css: '.x')).to be_enabled"
    ],
    [
      'checked',
      undefined,
      "@wait.until { @driver.find_element(css: '.x').selected? }\nexpect(@driver.find_element(css: '.x')).to be_selected",
      "@browser.element(css: '.x').to_subtype.wait_until(&:set?)\nexpect(@browser.element(css: '.x').to_subtype).to be_set"
    ],
    [
      'textEquals',
      'A',
      "@wait.until { @driver.find_element(css: '.x').text == 'A' }\nexpect(@driver.find_element(css: '.x').text).to eq('A')",
      "@browser.element(css: '.x').wait_until { |el| el.text == 'A' }\nexpect(@browser.element(css: '.x').text).to eq('A')"
    ],
    [
      'textIncludes',
      'A',
      "@wait.until { @driver.find_element(css: '.x').text.include?('A') }\nexpect(@driver.find_element(css: '.x').text).to include('A')",
      "@browser.element(css: '.x').wait_until { |el| el.text.include?('A') }\nexpect(@browser.element(css: '.x').text).to include('A')"
    ],
    [
      'valueEquals',
      'A',
      "@wait.until { @driver.find_element(css: '.x').attribute('value') == 'A' }\nexpect(@driver.find_element(css: '.x').attribute('value')).to eq('A')",
      "@browser.element(css: '.x').to_subtype.wait_until { |el| el.value == 'A' }\nexpect(@browser.element(css: '.x').to_subtype.value).to eq('A')"
    ],
    [
      'titleEquals',
      'A',
      "@wait.until { @driver.title == 'A' }\nexpect(@driver.title).to eq('A')",
      "@browser.wait_until { |b| b.title == 'A' }\nexpect(@browser.title).to eq('A')"
    ],
    [
      'urlIncludes',
      'A',
      "@wait.until { @driver.current_url.include?('A') }\nexpect(@driver.current_url).to include('A')",
      "@browser.wait_until { |b| b.url.include?('A') }\nexpect(@browser.url).to include('A')"
    ]
  ])('assert %s', (check, expected, sel, wat) => {
    expect(renderStep(assertStep(check, expected), 'selenium')).toBe(sel)
    expect(renderStep(assertStep(check, expected), 'watir')).toBe(wat)
  })

  it('switchFrame with element', () => {
    const s: Step = { id: '1', kind: 'switchFrame', element: id('f') }
    expect(renderStep(s, 'selenium')).toBe("@driver.switch_to.frame(@driver.find_element(id: 'f'))")
    const w = renderStep(s, 'watir')
    expect(w).toContain("@browser.wd.switch_to.frame(@browser.element(id: 'f').wd)")
    expect(w).toMatch(/^#.*\n/)
  })

  it('maps keys to symbols, unknown keys to strings', () => {
    const key = (k: string): Step => ({ id: '1', kind: 'pressKey', element: el, key: k })
    expect(renderStep(key('ArrowUp'), 'selenium')).toContain('send_keys(:arrow_up)')
    expect(renderStep(key('Escape'), 'watir')).toContain('send_keys(:escape)')
    expect(renderStep(key('Tab'), 'watir')).toContain('send_keys(:tab)')
    expect(renderStep(key('constructor'), 'selenium')).toContain("send_keys('constructor')")
    expect(renderStep(key('x'), 'selenium')).toContain("send_keys('x')")
    expect(renderStep(key("it's"), 'watir')).toContain("send_keys('it\\'s')")
  })

  it('escapes hostile text', () => {
    const text = 'He said "hi" \\ #{x} 🙂'
    const out = renderStep({ id: '1', kind: 'type', element: el, text }, 'selenium')
    expect(out).toContain(`send_keys('He said "hi" \\\\ #{x} 🙂')`)
  })

  it('handles xpath with both quote types', () => {
    const v = `//a[@x="1" and @y='2']`
    const out = renderStep(
      { id: '1', kind: 'click', element: { strategy: 'xpath', value: v } },
      'watir'
    )
    expect(out).toBe(`@browser.element(xpath: '//a[@x="1" and @y=\\'2\\']').click`)
  })

  it('throws on invalid asserts', () => {
    const bad = { id: '1', kind: 'assert', check: 'textEquals', element: el } as Step
    expect(() => renderStep(bad, 'selenium')).toThrow(/expected/)
    const bad2 = { id: '1', kind: 'assert', check: 'displayed' } as Step
    expect(() => renderStep(bad2, 'watir')).toThrow(/element/)
  })
})

const rubyBin = findRuby()

describe('receiver option', () => {
  it('ivar receiver unchanged', () => {
    const step: Step = { id: '1', kind: 'click', element: css('#a') }
    for (const a of ['selenium', 'watir'] as const) {
      expect(renderStep(step, a, { receiver: 'ivar' })).toBe(renderStep(step, a))
    }
  })

  it('helper receiver drops the ivars', () => {
    const step: Step = { id: '1', kind: 'click', element: css('#a') }
    expect(renderStep(step, 'selenium', { receiver: 'helper' })).toBe(
      "wait.until { driver.find_element(css: '#a').displayed? }\ndriver.find_element(css: '#a').click"
    )
    expect(renderStep(step, 'watir', { receiver: 'helper' })).toBe(
      "browser.element(css: '#a').click"
    )
  })
})

describe('helper receiver has no instance variables', () => {
  it('every step kind x automation', () => {
    const e = css('.x')
    const checks: AssertKind[] = [
      'displayed',
      'notDisplayed',
      'enabled',
      'checked',
      'textEquals',
      'textIncludes',
      'valueEquals',
      'titleEquals',
      'urlIncludes'
    ]
    const steps: Step[] = [
      { id: '1', kind: 'navigate', url: 'https://x.io' },
      { id: '2', kind: 'click', element: e },
      { id: '3', kind: 'type', element: e, text: 't' },
      { id: '4', kind: 'pressKey', element: e, key: 'Enter' },
      ...(['visible', 'hidden', 'enabled'] as const).map(
        (until, i): Step => ({ id: `w${i}`, kind: 'wait', element: e, until })
      ),
      ...checks.map(
        (c, i): Step => ({ id: `a${i}`, kind: 'assert', check: c, element: e, expected: 'v' })
      ),
      { id: '5', kind: 'switchFrame' },
      { id: '6', kind: 'switchFrame', element: e }
    ]
    for (const a of ['selenium', 'watir'] as const)
      for (const s of steps) expect(renderStep(s, a, { receiver: 'helper' })).not.toContain('@')
  })
})

describe('ruby syntax', () => {
  it.skipIf(!rubyBin)('every kind passes ruby -c', () => {
    const el = css('.x')
    const kinds: AssertKind[] = [
      'displayed',
      'notDisplayed',
      'enabled',
      'checked',
      'textEquals',
      'textIncludes',
      'valueEquals',
      'titleEquals',
      'urlIncludes'
    ]
    const steps: Step[] = [
      { id: '1', kind: 'navigate', url: 'https://x.io' },
      { id: '2', kind: 'click', element: el },
      { id: '3', kind: 'type', element: id('e'), text: 'He said "hi" \\ #{x} \'q\' 🙂' },
      { id: '4', kind: 'pressKey', element: el, key: 'ArrowUp' },
      { id: '5', kind: 'pressKey', element: el, key: 'x' },
      { id: '6', kind: 'wait', element: el, until: 'visible' },
      { id: '7', kind: 'wait', element: el, until: 'hidden' },
      { id: '8', kind: 'wait', element: el, until: 'enabled' },
      ...kinds.map(
        (k, i): Step => ({ id: `a${i}`, kind: 'assert', check: k, element: el, expected: 'v' })
      ),
      { id: '9', kind: 'switchFrame' },
      { id: '10', kind: 'switchFrame', element: id('f') },
      { id: '11', kind: 'custom', code: 'foo(1)' }
    ]
    for (const automation of ['selenium', 'watir'] as const) {
      const dir = mkdtempSync(join(tmpdir(), 'steps-'))
      const file = join(dir, 'x.rb')
      writeFileSync(file, steps.map((s) => renderStep(s, automation)).join('\n') + '\n')
      const r = spawnSync(rubyBin!, ['-c', file], { encoding: 'utf8' })
      expect(r.stderr + r.stdout).toContain('Syntax OK')
    }
  })
})

describe('semantic locators', () => {
  const xp = "//button[normalize-space()='Go']"
  const xpRb = xp.replace(/'/g, "\\'")
  const target = (locator: Locator): ElementTarget => ({ strategy: 'xpath', value: xp, locator })
  const watir = (locator: Locator): string =>
    renderStep({ id: '1', kind: 'click', element: target(locator) }, 'watir')
  const role = (
    r: string,
    nameFrom?: 'content' | 'aria-label' | 'other',
    tag?: string
  ): Locator => ({ by: 'role', role: r, name: 'It\'s "Go"', nameFrom, tag })
  const q = ".element(xpath: '" + xpRb + "')"
  const aria = (m: string): string => `.${m}(aria_label: 'It\\'s "Go"')`

  const rows: Array<[string, Locator, string]> = [
    ['button aria-label', role('button', 'aria-label', 'button'), aria('button')],
    ['link aria-label', role('link', 'aria-label', 'a'), aria('link')],
    ['textbox input aria-label', role('textbox', 'aria-label', 'input'), aria('text_field')],
    ['textbox textarea aria-label', role('textbox', 'aria-label', 'textarea'), aria('textarea')],
    ['checkbox aria-label', role('checkbox', 'aria-label', 'input'), aria('checkbox')],
    ['radio aria-label', role('radio', 'aria-label', 'input'), aria('radio')],
    ['combobox aria-label', role('combobox', 'aria-label', 'select'), aria('select_list')],
    ['div role=button aria-label', role('button', 'aria-label', 'div'), q],
    ['input button aria-label (ambiguous)', role('button', 'aria-label', 'input'), q],
    ['button aria-label without tag', role('button', 'aria-label'), q],
    ['button content', role('button', 'content', 'button'), q],
    ['link content', role('link', 'content', 'a'), q],
    ['button other', role('button', 'other', 'button'), q],
    ['button no nameFrom', role('button', undefined, 'button'), q],
    ['textbox other', role('textbox', 'other', 'input'), q],
    ['checkbox content', role('checkbox', 'content', 'input'), q],
    ['heading', role('heading', 'content', 'h1'), q],
    ['label', { by: 'label', text: 'Email' }, q],
    ['text', { by: 'text', text: "Don't" }, q],
    [
      'testId',
      { by: 'testId', attribute: 'data-test-id', value: "a'b" },
      ".element(data_test_id: 'a\\'b')"
    ],
    ['testId data.x', { by: 'testId', attribute: 'data.x', value: 'v' }, q],
    ['testId data-test_id', { by: 'testId', attribute: 'data-test_id', value: 'v' }, q],
    ['testId 1abc', { by: 'testId', attribute: '1abc', value: 'v' }, q]
  ]
  for (const [name, locator, tail] of rows)
    it(`watir ${name}`, () => expect(watir(locator)).toBe(`@browser${tail}.click`))

  it('id, css and xpath locators render as the strategy does', () => {
    const el: ElementTarget = {
      strategy: 'css',
      value: '#a',
      locator: { by: 'css', value: '#a', positional: false }
    }
    expect(renderStep({ id: '1', kind: 'click', element: el }, 'watir')).toBe(
      "@browser.element(css: '#a').click"
    )
  })

  it('odd test-id attributes fall back to the resolved css', () => {
    for (const attribute of ['data.x', 'data-test_id', '1abc']) {
      const el: ElementTarget = {
        strategy: 'css',
        value: `[${attribute}="v"]`,
        locator: { by: 'testId', attribute, value: 'v' }
      }
      expect(renderStep({ id: '1', kind: 'click', element: el }, 'watir')).toBe(
        `@browser.element(css: '[${attribute}="v"]').click`
      )
    }
  })

  it('type step keeps to_subtype with native forms', () => {
    const step: Step = {
      id: '1',
      kind: 'type',
      element: target(role('textbox', 'aria-label', 'input')),
      text: 'x'
    }
    expect(renderStep(step, 'watir')).toBe(
      "@browser.text_field(aria_label: 'It\\'s \"Go\"').to_subtype.set('x')"
    )
  })

  it('selenium output ignores the locator', () => {
    const step: Step = {
      id: '1',
      kind: 'click',
      element: target(role('button', 'content', 'button'))
    }
    expect(renderStep(step, 'selenium')).toBe(
      `@wait.until { @driver.find_element(xpath: '${xpRb}').displayed? }\n@driver.find_element(xpath: '${xpRb}').click`
    )
  })

  it.skipIf(!rubyBin)('quote-heavy locators pass ruby -c', () => {
    const steps: Step[] = rows.map(([, l], i) => ({
      id: `${i}`,
      kind: 'click',
      element: target(l)
    }))
    for (const automation of ['selenium', 'watir'] as const) {
      const file = join(mkdtempSync(join(tmpdir(), 'steps-')), 'x.rb')
      writeFileSync(file, steps.map((s) => renderStep(s, automation)).join('\n') + '\n')
      const r = spawnSync(rubyBin!, ['-c', file], { encoding: 'utf8' })
      expect(r.stderr + r.stdout).toContain('Syntax OK')
    }
  })
})
