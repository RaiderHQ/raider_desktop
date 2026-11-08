import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { findRuby } from './rubyBin'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { locatorArg, renderStep } from '../../../src/main/codegen/steps'
import type { Step, AssertKind, ElementTarget, Locator } from '../../../src/shared/types/step'

const css = (value: string): { strategy: 'css'; value: string } => ({
  strategy: 'css' as const,
  value
})
const id = (value: string): { strategy: 'id'; value: string } => ({
  strategy: 'id' as const,
  value
})

const ASSERTS: AssertKind[] = [
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

// Every kind once, for the syntax and receiver checks
function everyKind(el: ElementTarget): Step[] {
  return [
    { id: '1', kind: 'navigate', url: 'https://x.io' },
    { id: '2', kind: 'click', element: el },
    { id: '3', kind: 'type', element: id('e'), text: 'He said "hi" \\ #{x} \'q\' 🙂' },
    { id: '3s', kind: 'type', element: el, text: '', secret: true, secretName: 'RAIDER_SECRET_1' },
    { id: '4', kind: 'pressKey', element: el, key: 'ArrowUp' },
    { id: '5', kind: 'pressKey', element: el, key: 'x' },
    ...(['visible', 'hidden', 'enabled'] as const).map(
      (until, i): Step => ({ id: `w${i}`, kind: 'wait', element: el, until })
    ),
    ...ASSERTS.map(
      (k, i): Step => ({ id: `a${i}`, kind: 'assert', check: k, element: el, expected: 'v' })
    ),
    { id: '9', kind: 'switchFrame' },
    { id: '10', kind: 'switchFrame', element: id('f') },
    { id: '11', kind: 'custom', code: 'foo(1)' }
  ]
}

describe('renderStep table (standalone file, @driver)', () => {
  const rows: Array<[string, Step, string]> = [
    [
      'navigate',
      { id: '1', kind: 'navigate', url: 'https://x.io' },
      "@driver.navigate.to('https://x.io')"
    ],
    [
      'click',
      { id: '1', kind: 'click', element: css('#a') },
      "@driver.find_element(css: '#a').click"
    ],
    [
      'type',
      { id: '1', kind: 'type', element: id('email'), text: "a'b" },
      "@driver.find_element(id: 'email').clear\n@driver.find_element(id: 'email').send_keys('a\\'b')"
    ],
    [
      'pressKey',
      { id: '1', kind: 'pressKey', element: id('q'), key: 'Enter' },
      "@driver.find_element(id: 'q').send_keys(:enter)"
    ],
    [
      'wait hidden',
      { id: '1', kind: 'wait', element: css('.spinner'), until: 'hidden' },
      "expect { @driver.find_element(css: '.spinner') }.to be_hidden"
    ],
    [
      'wait visible',
      { id: '1', kind: 'wait', element: css('.a'), until: 'visible' },
      "expect { @driver.find_element(css: '.a') }.to be_visible"
    ],
    [
      'wait enabled',
      { id: '1', kind: 'wait', element: css('.a'), until: 'enabled' },
      "expect { @driver.find_element(css: '.a') }.to be_enabled"
    ],
    ['switchFrame default', { id: '1', kind: 'switchFrame' }, '@driver.switch_to.default_content'],
    [
      'switchFrame element',
      { id: '1', kind: 'switchFrame', element: id('f') },
      "@driver.switch_to.frame(@driver.find_element(id: 'f'))"
    ],
    ['custom', { id: '1', kind: 'custom', code: 'foo(1)' }, 'foo(1)']
  ]
  it.each(rows)('%s', (_n, step, expected) => {
    expect(renderStep(step)).toBe(expected)
    expect(renderStep(step, { receiver: 'ivar' })).toBe(expected)
  })
})

describe('renderStep assertions use the runtime matchers', () => {
  const el = css('.x')
  const assertStep = (check: AssertKind, expected?: string): Step => ({
    id: '1',
    kind: 'assert',
    check,
    element: el,
    expected
  })
  const find = "@driver.find_element(css: '.x')"

  // Element matchers take the find in a block so the runtime re-finds on every poll
  // and a gone element satisfies be_hidden; the page matchers read the driver.
  it.each<[AssertKind, string | undefined, string]>([
    ['displayed', undefined, `expect { ${find} }.to be_visible`],
    ['notDisplayed', undefined, `expect { ${find} }.to be_hidden`],
    ['enabled', undefined, `expect { ${find} }.to be_enabled`],
    ['checked', undefined, `expect { ${find} }.to be_checked`],
    ['textEquals', 'A', `expect { ${find} }.to have_text('A', exact: true)`],
    ['textIncludes', 'A', `expect { ${find} }.to have_text('A')`],
    ['valueEquals', 'A', `expect { ${find} }.to have_value('A')`],
    ['titleEquals', 'A', "expect(@driver).to have_title('A')"],
    // have_url compares the whole URL, so a part of it goes through the retrying block form
    ['urlIncludes', 'A', "expect { @driver.current_url }.to include('A')"]
  ])('assert %s', (check, expected, out) => {
    expect(renderStep(assertStep(check, expected))).toBe(out)
  })

  it('never emits the removed 3.x helper API', () => {
    const out = everyKind(el)
      .map((s) => renderStep(s))
      .join('\n')
    for (const removed of [
      'eventually',
      'wait.until',
      'displayed?',
      'enabled?',
      'selected?',
      "attribute('value')",
      'find_elements(',
      '.native',
      'timeout: 0',
      'be_displayed',
      'be_selected'
    ])
      expect(out).not.toContain(removed)
  })

  it('throws on invalid asserts', () => {
    const bad = { id: '1', kind: 'assert', check: 'textEquals', element: el } as Step
    expect(() => renderStep(bad)).toThrow(/expected/)
    const bad2 = { id: '1', kind: 'assert', check: 'displayed' } as Step
    expect(() => renderStep(bad2)).toThrow(/element/)
  })
})

describe('renderStep secret type steps', () => {
  const secret: Step = { id: '1', kind: 'type', element: id('pw'), text: '', secret: true }
  const named: Step = { ...secret, secretName: 'RAIDER_SECRET_2' } as Step

  it('reads the value from the environment variable stored on the step', () => {
    expect(renderStep(named)).toBe(
      "@driver.find_element(id: 'pw').clear\n@driver.find_element(id: 'pw').send_keys(ENV.fetch('RAIDER_SECRET_2'))"
    )
  })

  it('refuses a secret step that has no variable yet', () => {
    expect(() => renderStep(secret)).toThrow(/no variable/)
  })

  it.each(['GITHUB_TOKEN', 'RAIDER_TOKEN', 'RAIDER_SECRET'])(
    'refuses to read %s, which is not a RAIDER_SECRET_ variable',
    (secretName) => {
      const bad = { ...secret, secretName } as Step
      expect(() => renderStep(bad)).toThrow(/RAIDER_SECRET_/)
    }
  )

  it('reads RAIDER_SECRET_LOGIN', () => {
    expect(renderStep({ ...secret, secretName: 'RAIDER_SECRET_LOGIN' } as Step)).toContain(
      "ENV.fetch('RAIDER_SECRET_LOGIN')"
    )
  })
})

describe('renderStep details', () => {
  const el = css('.x')

  it('maps keys to symbols, unknown keys to strings', () => {
    const key = (k: string): Step => ({ id: '1', kind: 'pressKey', element: el, key: k })
    expect(renderStep(key('ArrowUp'))).toContain('send_keys(:arrow_up)')
    expect(renderStep(key('Escape'))).toContain('send_keys(:escape)')
    expect(renderStep(key('Tab'))).toContain('send_keys(:tab)')
    expect(renderStep(key('constructor'))).toContain("send_keys('constructor')")
    expect(renderStep(key('x'))).toContain("send_keys('x')")
    expect(renderStep(key("it's"))).toContain("send_keys('it\\'s')")
  })

  it('escapes hostile text', () => {
    const text = 'He said "hi" \\ #{x} 🙂'
    const out = renderStep({ id: '1', kind: 'type', element: el, text })
    expect(out).toContain(`send_keys('He said "hi" \\\\ #{x} 🙂')`)
  })

  it('handles xpath with both quote types', () => {
    const v = `//a[@x="1" and @y='2']`
    const out = renderStep({ id: '1', kind: 'click', element: { strategy: 'xpath', value: v } })
    expect(out).toBe(`@driver.find_element(xpath: '//a[@x="1" and @y=\\'2\\']').click`)
  })
})

const rubyBin = findRuby()

describe('receiver option', () => {
  it('helper receiver uses the spec_helper driver', () => {
    const step: Step = { id: '1', kind: 'click', element: css('#a') }
    expect(renderStep(step, { receiver: 'helper' })).toBe("driver.find_element(css: '#a').click")
  })

  it('every step kind has no instance variable with the helper receiver', () => {
    for (const s of everyKind(css('.x')))
      expect(renderStep(s, { receiver: 'helper' })).not.toContain('@')
  })

  it('title and url checks read the helper driver', () => {
    const title: Step = { id: '1', kind: 'assert', check: 'titleEquals', expected: 'T' }
    const url: Step = { id: '2', kind: 'assert', check: 'urlIncludes', expected: '/x' }
    expect(renderStep(title, { receiver: 'helper' })).toBe("expect(driver).to have_title('T')")
    expect(renderStep(url, { receiver: 'helper' })).toBe(
      "expect { driver.current_url }.to include('/x')"
    )
  })
})

describe('semantic locators', () => {
  const xp = "//button[normalize-space()='Go']"
  const target = (locator: Locator): ElementTarget => ({ strategy: 'xpath', value: xp, locator })
  const role = (
    r: string,
    nameFrom?: 'content' | 'aria-label' | 'other',
    tag?: string
  ): Locator => ({ by: 'role', role: r, name: 'It\'s "Go"', nameFrom, tag })

  // The recorder proved these unique by exact text, so the test asks for exactly that
  it.each<[string, Locator, string]>([
    [
      'role',
      role('button', 'content', 'button'),
      `by_role('button', name: 'It\\'s "Go"', exact: true)`
    ],
    ['label', { by: 'label', text: 'Email' }, "label: ['Email', { exact: true }]"],
    ['text', { by: 'text', text: 'Sign in' }, "text: ['Sign in', { exact: true }]"],
    ['testId', { by: 'testId', attribute: 'data-testid', value: 'save' }, "test_id: 'save'"],
    ['id', { by: 'id', value: 'go' }, "id: 'go'"],
    ['css short', { by: 'css', value: 'button.go', positional: false }, "css: 'button.go'"],
    [
      'css positional',
      { by: 'css', value: 'div > b:nth-of-type(2)', positional: true },
      "css: 'div > b:nth-of-type(2)'"
    ],
    ['xpath', { by: 'xpath', value: '//b[2]' }, "xpath: '//b[2]'"]
  ])('%s renders the runtime key', (_n, locator, expected) => {
    expect(locatorArg(target(locator))).toBe(expected)
    expect(renderStep({ id: '1', kind: 'click', element: target(locator) })).toBe(
      `@driver.find_element(${expected}).click`
    )
  })

  it('a test id recorded with another attribute still uses test_id (the project config names it)', () => {
    const l: Locator = { by: 'testId', attribute: 'data-cy', value: 'x' }
    expect(locatorArg(target(l))).toBe("test_id: 'x'")
  })

  it('without a semantic locator the Selenium pair is the locator', () => {
    expect(locatorArg({ strategy: 'xpath', value: xp })).toBe(`xpath: '${xp.replace(/'/g, "\\'")}'`)
    expect(locatorArg(id('go'))).toBe("id: 'go'")
  })

  it('every step kind renders the semantic locator, matchers included', () => {
    const el = target({ by: 'label', text: 'Email' })
    const out = everyKind(el)
      .map((s) => renderStep(s))
      .join('\n')
    expect(out).not.toContain('xpath:')
    expect(out).toContain(
      "expect { @driver.find_element(label: ['Email', { exact: true }]) }.to be_hidden"
    )
  })

  it.skipIf(!rubyBin)('quote-heavy locators pass ruby -c', () => {
    const steps: Step[] = [
      role('button', 'aria-label', 'button'),
      role('link', 'content', 'a'),
      { by: 'label', text: `it's "x" #{y}` },
      { by: 'text', text: `a\\b'c` },
      { by: 'testId', attribute: 'data-testid', value: `q'"` }
    ].map((l, i) => ({ id: `${i}`, kind: 'click', element: target(l) }))
    const file = join(mkdtempSync(join(tmpdir(), 'steps-')), 'x.rb')
    writeFileSync(file, steps.map((s) => renderStep(s)).join('\n') + '\n')
    const r = spawnSync(rubyBin!, ['-c', file], { encoding: 'utf8' })
    expect(r.stderr + r.stdout).toContain('Syntax OK')
  })
})

describe('ruby syntax', () => {
  it.skipIf(!rubyBin)('every kind passes ruby -c, with both receivers', () => {
    const tricky: Step[] = [
      {
        id: 'x',
        kind: 'click',
        element: { strategy: 'xpath', value: `//a[text()="it's" and @b='a#{b}']` }
      },
      { id: 'y', kind: 'assert', check: 'textEquals', element: css('.x'), expected: 'a#{b}' }
    ]
    for (const receiver of ['ivar', 'helper'] as const) {
      const body = [...everyKind(css('.x')), ...tricky]
        .map((s) => renderStep(s, { receiver }))
        .join('\n')
      const file = join(mkdtempSync(join(tmpdir(), 'steps-')), 'x.rb')
      writeFileSync(file, `describe 'x' do\nit 'y' do\n${body}\nend\nend\n`)
      const r = spawnSync(rubyBin!, ['-c', file], { encoding: 'utf8' })
      expect(r.stderr + r.stdout).toContain('Syntax OK')
    }
  })
})
