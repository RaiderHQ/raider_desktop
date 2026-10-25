import type { RecorderSettings } from '../../shared/types/recorderSettings'
import type { Step } from '../../shared/types/step'
import { rubyString } from './ruby'
import { renderStep } from './steps'
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
  const body = test.steps.map((step) => indent(renderStep(step, automation), 4))

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
