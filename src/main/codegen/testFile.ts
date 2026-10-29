import type { RecorderSettings } from '../../shared/types/recorderSettings'
import type { Step } from '../../shared/types/step'
import { posix } from 'node:path'
import { rubyString } from './ruby'
import { renderStep } from './steps'
import { secretEnvNames } from '../../shared/secretSteps'
import type { Automation } from './steps'

export type { Automation }

type FileSettings = Pick<RecorderSettings, 'browser' | 'headless' | 'implicitWait' | 'explicitWait'>

const BROWSERS = ['chrome', 'firefox', 'safari', 'edge']

export function toAutomation(projectAutomation: string | null): Automation {
  return projectAutomation && /watir/i.test(projectAutomation) ? 'watir' : 'selenium'
}

function browserSymbol(browser: string): string {
  const name = browser.toLowerCase()
  return BROWSERS.includes(name) ? name : 'chrome'
}

function seleniumSetup(settings: FileSettings): string[] {
  const browser = browserSymbol(settings.browser)
  const lines: string[] = []
  if (settings.headless && (browser === 'chrome' || browser === 'edge')) {
    const klass = browser === 'chrome' ? 'Chrome' : 'Edge'
    lines.push(
      `options = Selenium::WebDriver::${klass}::Options.new`,
      "options.add_argument('--headless=new')",
      `@driver = Selenium::WebDriver.for :${browser}, options: options`
    )
  } else {
    lines.push(`@driver = Selenium::WebDriver.for :${browser}`)
  }
  lines.push(
    `@driver.manage.timeouts.implicit_wait = ${settings.implicitWait}`,
    `@wait = Selenium::WebDriver::Wait.new(timeout: ${settings.explicitWait})`
  )
  return lines
}

function watirSetup(settings: FileSettings): string[] {
  const browser = browserSymbol(settings.browser)
  const lines = [`Watir.default_timeout = ${settings.explicitWait}`]
  if (settings.headless && (browser === 'chrome' || browser === 'edge')) {
    lines.push(`@browser = Watir::Browser.new :${browser}, options: { args: ['--headless=new'] }`)
  } else {
    lines.push(`@browser = Watir::Browser.new :${browser}`)
  }
  lines.push(`@browser.driver.manage.timeouts.implicit_wait = ${settings.implicitWait}`)
  return lines
}

const indent = (text: string, spaces: number): string =>
  text
    .split('\n')
    .map((line) => (line === '' ? line : ' '.repeat(spaces) + line))
    .join('\n')

/** Builds a standalone RSpec file (run and export share it) from structured steps. */
export function generateRspecFile(
  test: { name: string; steps: Step[] },
  automation: Automation,
  settings: FileSettings
): string {
  const watir = automation === 'watir'
  const setup = watir ? watirSetup(settings) : seleniumSetup(settings)
  const teardown = watir ? '@browser.close' : '@driver.quit'
  const name = rubyString(test.name)
  const secrets = secretEnvNames(test.steps)
  const body = test.steps.map((step) =>
    indent(renderStep(step, automation, { secretName: secrets.get(step.id) }), 4)
  )

  return [
    `require '${watir ? 'watir' : 'selenium-webdriver'}'`,
    "require 'rspec'",
    '',
    `describe ${name} do`,
    '  before(:each) do',
    ...setup.map((l) => `    ${l}`),
    '  end',
    '',
    '  after(:each) do',
    `    ${teardown}`,
    '  end',
    '',
    `  it ${name} do`,
    ...body,
    '  end',
    'end',
    ''
  ].join('\n')
}

// Same lookup the project's own config uses: explicit_wait, falling back to timeout, then 10
const CONFIG_WAIT = "config.fetch('explicit_wait', config.fetch('timeout', 10))"

// rubocop-rspec's DescribeClass accepts a describe string only when it reads like a constant
const CONSTANT_LIKE = /^(?:(?:::)?[A-Z]\w*)+$/
const EXPECTATION = /\b(?:expect|is_expected|are_expected|expect_any_instance_of)\b/g
// Ruby string literals and trailing comments, so recorded values like 'expect delays' don't count
const STRING_LITERAL = /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g
const TRAILING_COMMENT = /#.*$/

/**
 * The cops (at rubocop-rspec defaults) a recorded test would trip. The file is
 * regenerated, so they are disabled around it; disabling one that would not
 * fire is itself an offense (Lint/RedundantCopDisableDirective), so the list
 * must match the test.
 */
function copsToDisable(name: string, body: string[]): string[] {
  // ExampleLength counts code lines only, like rubocop with CountComments off
  const code = body
    .join('\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
  const expectations = code.reduce((n, line) => {
    const bare = line.replace(STRING_LITERAL, "''").replace(TRAILING_COMMENT, '')
    return n + (bare.match(EXPECTATION)?.length ?? 0)
  }, 0)
  const cops: string[] = []
  if (!CONSTANT_LIKE.test(name)) cops.push('RSpec/DescribeClass')
  if (code.length > 5) cops.push('RSpec/ExampleLength')
  if (expectations > 1) cops.push('RSpec/MultipleExpectations')
  return cops
}

/**
 * Builds a recorded spec that lives inside a Ruby Raider project and uses the
 * project's spec_helper (driver / browser) instead of creating its own session.
 * `fileRelPath` and `helperPath` are relative to the project root.
 */
/** Header line that marks a spec file as written by Raider (hashRuby ignores comments). */
export const RECORDED_MARKER = '# Recorded with Raider.'

export function generateProjectSpecFile(
  test: { name: string; steps: Step[] },
  automation: Automation,
  opts: { fileRelPath: string; helperPath: string }
): string {
  const watir = automation === 'watir'
  const name = rubyString(test.name)
  const fileRel = opts.fileRelPath.replace(/\\/g, '/')
  const helperRel = opts.helperPath.replace(/\\/g, '/')
  if (
    posix.isAbsolute(fileRel) ||
    posix.isAbsolute(helperRel) ||
    /^[A-Za-z]:/.test(fileRel + helperRel)
  )
    throw new Error('Project spec paths must be relative to the project root')
  const toHelper = posix.relative(posix.dirname(fileRel), posix.join(helperRel, 'spec_helper'))
  const setup = watir
    ? [
        '  before do',
        '    # touch browser first: the helper resets the timeout when it creates the browser',
        '    browser',
        "    config = YAML.load_file('config/config.yml')",
        `    Watir.default_timeout = ${CONFIG_WAIT}`,
        '  end'
      ]
    : [
        '  let(:wait) do',
        "    config = YAML.load_file('config/config.yml')",
        `    Selenium::WebDriver::Wait.new(timeout: ${CONFIG_WAIT})`,
        '  end'
      ]
  const secrets = secretEnvNames(test.steps)
  const body = test.steps.map((step) =>
    indent(
      renderStep(step, automation, { receiver: 'helper', secretName: secrets.get(step.id) }),
      4
    )
  )
  const cops = copsToDisable(test.name, body).join(', ')

  return [
    '# frozen_string_literal: true',
    '',
    `${RECORDED_MARKER} Edit in Raider; editing here makes the test code-owned.`,
    ...(cops ? [`# rubocop:disable ${cops}`] : []),
    `require_relative ${rubyString(toHelper)}`,
    '',
    `describe ${name} do`,
    ...setup,
    '',
    `  it ${name} do`,
    ...body,
    '  end',
    'end',
    ...(cops ? [`# rubocop:enable ${cops}`] : []),
    ''
  ].join('\n')
}
