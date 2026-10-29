import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'
import { generateRspecFile, toAutomation } from '../../../src/main/codegen/testFile'
import type { Step, AssertKind } from '../../../src/shared/types/step'

const settings = { browser: 'chrome', headless: false, implicitWait: 0, explicitWait: 30 }
const steps: Step[] = [
  { id: '1', kind: 'navigate', url: 'https://x.io' },
  { id: '2', kind: 'click', element: { strategy: 'css', value: '#a' } }
]
const test = { name: 'Login', steps }

describe('toAutomation', () => {
  it('maps watir (any case) to watir, everything else to selenium', () => {
    expect(toAutomation('watir')).toBe('watir')
    expect(toAutomation('Watir')).toBe('watir')
    expect(toAutomation('selenium')).toBe('selenium')
    expect(toAutomation('capybara')).toBe('selenium')
    expect(toAutomation(null)).toBe('selenium')
  })
})

describe('generateRspecFile', () => {
  it('requires the automation and rspec', () => {
    const code = generateRspecFile(test, 'selenium', settings)
    expect(code).toContain("require 'selenium-webdriver'")
    expect(code).toContain("require 'rspec'")
    expect(generateRspecFile(test, 'watir', settings)).toContain("require 'watir'")
  })

  it('adds --headless=new for headless chrome and edge only', () => {
    const headless = { ...settings, headless: true }
    expect(generateRspecFile(test, 'selenium', headless)).toContain("'--headless=new'")
    expect(generateRspecFile(test, 'selenium', { ...headless, browser: 'edge' })).toContain(
      'Edge::Options'
    )
    expect(generateRspecFile(test, 'selenium', { ...headless, browser: 'firefox' })).not.toContain(
      'headless'
    )
    expect(generateRspecFile(test, 'selenium', settings)).not.toContain('headless')
    expect(generateRspecFile(test, 'watir', headless)).toContain("'--headless=new'")
  })

  it('builds the driver for the configured browser', () => {
    for (const browser of ['firefox', 'safari', 'edge', 'chrome']) {
      expect(generateRspecFile(test, 'selenium', { ...settings, browser })).toContain(
        `Selenium::WebDriver.for :${browser}`
      )
    }
    expect(generateRspecFile(test, 'watir', { ...settings, browser: 'firefox' })).toContain(
      'Watir::Browser.new :firefox'
    )
  })

  it('sets waits and quits the driver', () => {
    const code = generateRspecFile(test, 'selenium', {
      ...settings,
      implicitWait: 5,
      explicitWait: 60
    })
    expect(code).toContain('implicit_wait = 5')
    expect(code).toContain('Selenium::WebDriver::Wait.new(timeout: 60)')
    expect(code).toContain('@driver.quit')
  })

  it('sets the Watir default timeout and closes the browser', () => {
    const code = generateRspecFile(test, 'watir', { ...settings, explicitWait: 45 })
    expect(code).toContain('Watir.default_timeout = 45')
    expect(code).toContain('@browser.close')
  })

  it('indents rendered steps in the it block and never sleeps', () => {
    const code = generateRspecFile(test, 'selenium', settings)
    expect(code).toContain("    @driver.navigate.to('https://x.io')")
    expect(code).toContain("    @driver.find_element(css: '#a').click")
    expect(code).not.toContain('sleep(')
  })

  it('keeps each secret step on its stored variable, whatever the order', () => {
    const pw = { strategy: 'id' as const, value: 'pw' }
    const code = generateRspecFile(
      {
        name: 'Login',
        steps: [
          {
            id: 'c',
            kind: 'type',
            element: pw,
            text: '',
            secret: true,
            secretName: 'RAIDER_SECRET_2'
          },
          {
            id: 'a',
            kind: 'type',
            element: pw,
            text: '',
            secret: true,
            secretName: 'RAIDER_SECRET_1'
          }
        ]
      },
      'selenium',
      settings
    )
    expect(code.indexOf("ENV.fetch('RAIDER_SECRET_2')")).toBeLessThan(
      code.indexOf("ENV.fetch('RAIDER_SECRET_1')")
    )
  })

  it('names old unnamed secret steps in order and never writes a typed value', () => {
    const pw = { strategy: 'id' as const, value: 'pw' }
    const code = generateRspecFile(
      {
        name: 'Login',
        steps: [
          { id: 'a', kind: 'type', element: pw, text: '', secret: true },
          { id: 'b', kind: 'type', element: pw, text: 'visible' },
          { id: 'c', kind: 'type', element: pw, text: '', secret: true }
        ]
      },
      'selenium',
      settings
    )
    expect(code).toContain("send_keys(ENV.fetch('RAIDER_SECRET_1'))")
    expect(code).toContain("send_keys('visible')")
    expect(code).toContain("send_keys(ENV.fetch('RAIDER_SECRET_2'))")
  })

  it('quotes the test name safely', () => {
    const code = generateRspecFile({ name: `It's "ok"`, steps: [] }, 'selenium', settings)
    expect(code).toContain(`describe 'It\\'s "ok"' do`)
    expect(code).toContain(`it 'It\\'s "ok"' do`)
  })
})

const rubyBin = ['ruby', join(homedir(), '.rubies/3.4.1/bin/ruby')].find((r) => {
  if (r.startsWith('/') && !existsSync(r)) return false
  return spawnSync(r, ['-e', '1']).status === 0
})

describe('generated file syntax', () => {
  it.skipIf(!rubyBin)('passes ruby -c for every step kind, selenium and watir', () => {
    const el = { strategy: 'css' as const, value: '.x' }
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
    const all: Step[] = [
      { id: '1', kind: 'navigate', url: 'https://x.io' },
      { id: '2', kind: 'click', element: el },
      { id: '3', kind: 'type', element: el, text: 'He said "hi" \\ #{x} \'q\'' },
      { id: '4', kind: 'pressKey', element: el, key: 'ArrowUp' },
      { id: '5', kind: 'wait', element: el, until: 'visible' },
      { id: '6', kind: 'wait', element: el, until: 'hidden' },
      { id: '7', kind: 'wait', element: el, until: 'enabled' },
      ...kinds.map(
        (k, i): Step => ({ id: `a${i}`, kind: 'assert', check: k, element: el, expected: 'v' })
      ),
      { id: '8', kind: 'switchFrame' },
      { id: '9', kind: 'switchFrame', element: el },
      { id: '10', kind: 'custom', code: 'foo(1)' }
    ]
    for (const automation of ['selenium', 'watir'] as const) {
      const dir = mkdtempSync(join(tmpdir(), 'testfile-'))
      const file = join(dir, 'x_spec.rb')
      const code = generateRspecFile({ name: `It's "ok"`, steps: all }, automation, {
        ...settings,
        headless: true
      })
      writeFileSync(file, code)
      const r = spawnSync(rubyBin!, ['-c', file], { encoding: 'utf8' })
      expect(r.stderr + r.stdout).toContain('Syntax OK')
    }
  })
})
