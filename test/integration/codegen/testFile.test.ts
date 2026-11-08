import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CODEGEN_VERSION, generateRspecFile } from '../../../src/main/codegen/testFile'
import { findRuby } from './rubyBin'
import type { Step, AssertKind } from '../../../src/shared/types/step'

const settings = { browser: 'chrome', headless: false, explicitWait: 30 }
const steps: Step[] = [
  { id: '1', kind: 'navigate', url: 'https://x.io' },
  { id: '2', kind: 'click', element: { strategy: 'css', value: '#a' } }
]
const test = { name: 'Login', steps }

describe('generateRspecFile', () => {
  it('requires selenium, rspec and the ruby_raider runtime, and includes its helpers', () => {
    const code = generateRspecFile(test, settings)
    expect(code).toContain("require 'selenium-webdriver'")
    expect(code).toContain("require 'rspec'")
    expect(code).toContain("require 'ruby_raider/runtime/rspec'")
    expect(code).toContain('  include Raider::Matchers\n  include Raider::Helpers')
    expect(code).not.toContain('watir')
    expect(code).not.toContain('Watir')
  })

  it('adds --headless=new for headless chrome and edge only', () => {
    const headless = { ...settings, headless: true }
    expect(generateRspecFile(test, headless)).toContain("'--headless=new'")
    expect(generateRspecFile(test, { ...headless, browser: 'edge' })).toContain('Edge::Options')
    expect(generateRspecFile(test, { ...headless, browser: 'firefox' })).not.toContain('headless')
    expect(generateRspecFile(test, settings)).not.toContain('headless')
  })

  it('builds the driver for the configured browser, chrome for an unknown one', () => {
    for (const browser of ['firefox', 'safari', 'edge', 'chrome']) {
      expect(generateRspecFile(test, { ...settings, browser })).toContain(
        `Selenium::WebDriver.for :${browser}`
      )
    }
    expect(generateRspecFile(test, { ...settings, browser: 'netscape' })).toContain(
      'Selenium::WebDriver.for :chrome'
    )
  })

  it('sets the runtime timeout, no implicit wait, and quits the driver', () => {
    const code = generateRspecFile(test, { ...settings, explicitWait: 60 })
    expect(code).toContain('Raider.timeout = 60')
    expect(code).not.toContain('implicit_wait')
    expect(code).toContain('@driver.quit')
  })

  it('creates @wait only when a custom step mentions it', () => {
    expect(generateRspecFile(test, settings)).not.toContain('@wait')
    const custom: Step = { id: 'c', kind: 'custom', code: '@wait.until { @driver.title == "x" }' }
    const code = generateRspecFile({ name: 'W', steps: [...steps, custom] }, settings)
    expect(code).toContain('@wait = Selenium::WebDriver::Wait.new(timeout: 30)')
    // A recorded value that says "wait" is not a use of the wait object
    const typed: Step = {
      id: 't',
      kind: 'type',
      element: { strategy: 'id', value: 'q' },
      text: 'please wait'
    }
    expect(generateRspecFile({ name: 'W', steps: [typed] }, settings)).not.toContain('@wait')
  })

  it('indents rendered steps in the it block and never sleeps', () => {
    const code = generateRspecFile(test, settings)
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
      settings
    )
    expect(code).toContain("send_keys(ENV.fetch('RAIDER_SECRET_1'))")
    expect(code).toContain("send_keys('visible')")
    expect(code).toContain("send_keys(ENV.fetch('RAIDER_SECRET_2'))")
  })

  it('quotes the test name safely', () => {
    const code = generateRspecFile({ name: `It's "ok"`, steps: [] }, settings)
    expect(code).toContain(`describe 'It\\'s "ok"' do`)
    expect(code).toContain(`it 'It\\'s "ok"' do`)
  })

  it('is the 4.0 runtime shape', () => {
    expect(CODEGEN_VERSION).toBe(2)
  })
})

const rubyBin = findRuby()

describe('generated file syntax', () => {
  it.skipIf(!rubyBin)('passes ruby -c for every step kind', () => {
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
      { id: '10', kind: 'custom', code: '@wait.until { foo(1) }' }
    ]
    const dir = mkdtempSync(join(tmpdir(), 'testfile-'))
    const file = join(dir, 'x_spec.rb')
    const code = generateRspecFile(
      { name: `It's "ok"`, steps: all },
      { ...settings, headless: true }
    )
    writeFileSync(file, code)
    const r = spawnSync(rubyBin!, ['-c', file], { encoding: 'utf8' })
    expect(r.stderr + r.stdout).toContain('Syntax OK')
  })
})

describe('generateRspecFile tags', () => {
  it('writes sorted symbols on the describe line, nothing without tags', () => {
    const tagged = generateRspecFile({ ...test, tags: ['b', 'a'] }, settings)
    expect(tagged).toMatch(/^describe '.*', :a, :b do$/m)
    expect(generateRspecFile({ ...test, tags: [] }, settings)).toBe(
      generateRspecFile(test, settings)
    )
  })
})
