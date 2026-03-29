/**
 * Framework-aware code generation templates.
 *
 * Provides command generation (recorder), test wrappers (export/run),
 * and setup/teardown blocks for each supported automation + test framework.
 */

import xpathConverter from './xpathConverter'

// ---------------------------------------------------------------------------
// Recorder command generation — per automation framework
// ---------------------------------------------------------------------------

const keyMap: { [key: string]: string } = {
  Enter: ':enter',
  Tab: ':tab',
  Space: ':space',
  Backspace: ':backspace',
  Delete: ':delete',
  Escape: ':escape',
  ArrowUp: ':arrow_up',
  ArrowDown: ':arrow_down',
  ArrowLeft: ':arrow_left',
  ArrowRight: ':arrow_right',
  Home: ':home',
  End: ':end',
  PageUp: ':page_up',
  PageDown: ':page_down',
  F1: ':f1',
  F2: ':f2',
  F3: ':f3',
  F4: ':f4',
  F5: ':f5',
  F6: ':f6',
  F7: ':f7',
  F8: ':f8',
  F9: ':f9',
  F10: ':f10',
  F11: ':f11',
  F12: ':f12'
}

export interface RecorderAction {
  action: 'click' | 'type' | 'sendKeys'
  selector: string
  strategy: string
  tagName: string
  value?: string
}

function escapeSelector(strategy: string, selector: string): string {
  if (strategy === 'xpath') {
    return xpathConverter(selector)
  }
  return `"${selector.replace(/"/g, '"')}"`
}

export function generateSeleniumCommand(data: RecorderAction): string {
  const escapedValue = escapeSelector(data.strategy, data.selector)

  switch (data.action) {
    case 'click':
      return `@driver.find_element(:${data.strategy}, ${escapedValue}).click # Clicked <${data.tagName.toLowerCase()}>`

    case 'type': {
      const escapedDataValue = data.value!.replace(/"/g, '"')
      return (
        `@driver.find_element(:${data.strategy}, ${escapedValue}).clear\n` +
        `    @driver.find_element(:${data.strategy}, ${escapedValue}).send_keys("${escapedDataValue}")`
      )
    }

    case 'sendKeys': {
      const keySymbol = keyMap[data.value!]
      if (keySymbol) {
        return `@driver.find_element(:${data.strategy}, ${escapedValue}).send_keys(${keySymbol}) # Pressed ${data.value} on <${data.tagName.toLowerCase()}>`
      }
      return ''
    }

    default:
      return ''
  }
}

export function generateCapybaraCommand(data: RecorderAction): string {
  const { strategy, selector, tagName } = data
  const selectorArg =
    strategy === 'css' ? `"${selector}"` : strategy === 'xpath' ? `(:xpath, ${escapeSelector(strategy, selector)})` : `"#${selector}"`

  switch (data.action) {
    case 'click':
      return `find(${selectorArg}).click # Clicked <${tagName.toLowerCase()}>`

    case 'type': {
      const escapedDataValue = data.value!.replace(/"/g, '"')
      if (strategy === 'id') {
        return `fill_in "${selector}", with: "${escapedDataValue}"`
      }
      return (
        `find(${selectorArg}).set("")\n` +
        `    find(${selectorArg}).set("${escapedDataValue}")`
      )
    }

    case 'sendKeys': {
      const keyName = data.value!.toLowerCase().replace('arrow_', '')
      return `find(${selectorArg}).send_keys(:${keyName}) # Pressed ${data.value} on <${tagName.toLowerCase()}>`
    }

    default:
      return ''
  }
}

export function generateWatirCommand(data: RecorderAction): string {
  const { strategy, selector, tagName } = data

  let watirSelector: string
  if (strategy === 'id') {
    watirSelector = `id: "${selector}"`
  } else if (strategy === 'css') {
    watirSelector = `css: "${selector}"`
  } else {
    watirSelector = `xpath: ${escapeSelector(strategy, selector)}`
  }

  switch (data.action) {
    case 'click':
      return `browser.element(${watirSelector}).click # Clicked <${tagName.toLowerCase()}>`

    case 'type': {
      const escapedDataValue = data.value!.replace(/"/g, '"')
      return (
        `browser.element(${watirSelector}).clear\n` +
        `    browser.element(${watirSelector}).send_keys("${escapedDataValue}")`
      )
    }

    case 'sendKeys': {
      const keySymbol = keyMap[data.value!]
      if (keySymbol) {
        return `browser.element(${watirSelector}).send_keys(${keySymbol}) # Pressed ${data.value} on <${tagName.toLowerCase()}>`
      }
      return ''
    }

    default:
      return ''
  }
}

export function generateCommand(automation: string | null, data: RecorderAction): string {
  switch (automation) {
    case 'capybara':
      return generateCapybaraCommand(data)
    case 'watir':
      return generateWatirCommand(data)
    default:
      return generateSeleniumCommand(data)
  }
}

// ---------------------------------------------------------------------------
// Export templates — per test framework
// ---------------------------------------------------------------------------

interface ExportTemplateParams {
  testName: string
  suiteName?: string
  steps: string[]
  automation: string | null
}

function requireLine(automation: string | null): string {
  switch (automation) {
    case 'capybara':
      return "require 'capybara/dsl'"
    case 'watir':
      return "require 'watir'"
    default:
      return "require 'selenium-webdriver'"
  }
}

function setupLine(automation: string | null): string {
  switch (automation) {
    case 'capybara':
      return `Capybara.default_driver = :selenium_chrome`
    case 'watir':
      return `browser = Watir::Browser.new :chrome`
    default:
      return `driver = Selenium::WebDriver.for :chrome\nwait = Selenium::WebDriver::Wait.new(timeout: 10)`
  }
}

function teardownLine(automation: string | null): string {
  switch (automation) {
    case 'capybara':
      return 'Capybara.current_session.driver.quit'
    case 'watir':
      return 'browser.close'
    default:
      return 'driver.quit'
  }
}

export function generateRspecExport({ testName, suiteName, steps, automation }: ExportTemplateParams): string {
  const stepsContent = steps.map((step) => `  ${step}`).join('\n')
  const header = suiteName ? `# Test: ${testName}\n# Suite: ${suiteName}` : `# Test: ${testName}`

  return `#!/usr/bin/env ruby

${header}
# Exported from IDE on ${new Date().toLocaleString()}

${requireLine(automation)}

# --- Setup ---
${setupLine(automation)}

puts "Starting test: ${testName}"

# --- Test Steps ---
begin
${stepsContent}
  puts "Test '${testName}' passed successfully!"
rescue => e
  puts "Test '${testName}' failed: \#{e.message}"
ensure
  # --- Teardown ---
  puts "Closing driver."
  ${teardownLine(automation)}
end
`
}

export function generateMinitestExport({ testName, suiteName, steps, automation }: ExportTemplateParams): string {
  const className = testName.replace(/[^a-zA-Z0-9]/g, '')
  const methodName = testName.replace(/[^a-z0-9]/gi, '_').toLowerCase()
  const stepsContent = steps.map((step) => `      ${step}`).join('\n')
  const header = suiteName ? `# Test: ${testName}\n# Suite: ${suiteName}` : `# Test: ${testName}`

  let setupBody: string
  let teardownBody: string

  switch (automation) {
    case 'capybara':
      setupBody = `      Capybara.default_driver = :selenium_chrome`
      teardownBody = `      Capybara.current_session.driver.quit`
      break
    case 'watir':
      setupBody = `      @browser = Watir::Browser.new :chrome`
      teardownBody = `      @browser.close`
      break
    default:
      setupBody = `      @driver = Selenium::WebDriver.for :chrome\n      @wait = Selenium::WebDriver::Wait.new(timeout: 10)`
      teardownBody = `      @driver.quit`
      break
  }

  return `#!/usr/bin/env ruby

${header}
# Exported from IDE on ${new Date().toLocaleString()}

${requireLine(automation)}
require 'minitest/autorun'

class Test${className} < Minitest::Test
  def setup
${setupBody}
  end

  def teardown
${teardownBody}
  end

  def test_${methodName}
${stepsContent}
  end
end
`
}

export function generateCucumberExport({ testName, steps }: ExportTemplateParams): string {
  const stepsContent = steps
    .map((step, i) => `    # Step ${i + 1}\n    ${step}`)
    .join('\n')

  return `# Feature: ${testName}
# Exported from IDE on ${new Date().toLocaleString()}

Feature: ${testName}

  Scenario: ${testName}
    Given I start the test
    When I execute the recorded steps
    Then the test should pass

# Step definitions:
# Given('I start the test') do
#   # Setup
# end
#
# When('I execute the recorded steps') do
${stepsContent}
# end
#
# Then('the test should pass') do
#   # Assertions
# end
`
}

export function generateExportContent(
  framework: string | null,
  params: ExportTemplateParams
): string {
  switch (framework) {
    case 'minitest':
      return generateMinitestExport(params)
    case 'cucumber':
      return generateCucumberExport(params)
    default:
      return generateRspecExport(params)
  }
}

// ---------------------------------------------------------------------------
// Test execution code generation — per test framework
// ---------------------------------------------------------------------------

interface TestCodeParams {
  testName: string
  steps: string[]
  implicitWait: number
  explicitWait: number
  automation: string | null
  headless?: boolean
}

export function generateRspecTestCode({
  testName,
  steps,
  implicitWait,
  explicitWait,
  automation,
  headless
}: TestCodeParams): string {
  const formattedSteps = steps.map((step) => `    ${step}`).join('\n    sleep(1)\n')

  let setupBlock: string
  let teardownBlock: string
  let helperMethod: string

  switch (automation) {
    case 'capybara':
      setupBlock = `    Capybara.default_driver = :selenium_chrome\n    @page = Capybara.current_session`
      teardownBlock = `    Capybara.current_session.driver.quit`
      helperMethod = `  def find_and_wait(selector)\n    @page.find(selector, wait: ${explicitWait})\n  end`
      break
    case 'watir':
      setupBlock = `    @browser = Watir::Browser.new :chrome\n    @browser.driver.manage.timeouts.implicit_wait = ${implicitWait}`
      teardownBlock = `    @browser.close`
      helperMethod = `  def find_and_wait(selector)\n    @browser.element(css: selector).wait_until(timeout: ${explicitWait}, &:present?)\n  end`
      break
    default: {
      const chromeSetup = headless
        ? `opts = Selenium::WebDriver::Chrome::Options.new(args: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage'])\n    @driver = Selenium::WebDriver.for :chrome, options: opts`
        : `@driver = Selenium::WebDriver.for :chrome`
      setupBlock = `    ${chromeSetup}\n    @driver.manage.timeouts.implicit_wait = ${implicitWait}\n    @wait = Selenium::WebDriver::Wait.new(timeout: ${explicitWait})\n    @vars = {}`
      teardownBlock = `    if example.exception\n      # You can add custom screenshot logic here if needed\n    end\n    @driver.quit`
      helperMethod = `  def find_and_wait(selector)\n    @wait.until { @driver.find_element(:css, selector).displayed? }\n    return @driver.find_element(:css, selector)\n  end`
      break
    }
  }

  return `
${requireLine(automation)}
require 'rspec'

describe '${testName}' do
  before(:each) do
${setupBlock}
  end

  after(:each) do |example|
${teardownBlock}
  end

${helperMethod}

  it '${testName}' do
${formattedSteps}
  end
end
`
}

export function generateMinitestTestCode({
  testName,
  steps,
  implicitWait,
  explicitWait,
  automation
}: TestCodeParams): string {
  const className = testName.replace(/[^a-zA-Z0-9]/g, '')
  const methodName = testName.replace(/[^a-z0-9]/gi, '_').toLowerCase()
  const formattedSteps = steps.map((step) => `    ${step}`).join('\n    sleep(1)\n')

  let setupBody: string
  let teardownBody: string

  switch (automation) {
    case 'capybara':
      setupBody = `    Capybara.default_driver = :selenium_chrome\n    @page = Capybara.current_session`
      teardownBody = `    Capybara.current_session.driver.quit`
      break
    case 'watir':
      setupBody = `    @browser = Watir::Browser.new :chrome\n    @browser.driver.manage.timeouts.implicit_wait = ${implicitWait}`
      teardownBody = `    @browser.close`
      break
    default:
      setupBody = `    @driver = Selenium::WebDriver.for :chrome\n    @driver.manage.timeouts.implicit_wait = ${implicitWait}\n    @wait = Selenium::WebDriver::Wait.new(timeout: ${explicitWait})`
      teardownBody = `    @driver.quit`
      break
  }

  return `
${requireLine(automation)}
require 'minitest/autorun'

class Test${className} < Minitest::Test
  def setup
${setupBody}
  end

  def teardown
${teardownBody}
  end

  def test_${methodName}
${formattedSteps}
  end
end
`
}

export function generateTestCode(
  framework: string | null,
  params: TestCodeParams
): string {
  switch (framework) {
    case 'minitest':
      return generateMinitestTestCode(params)
    default:
      return generateRspecTestCode(params)
  }
}

/**
 * Returns the shell command to run a test file for the given framework.
 */
export function getTestRunCommand(
  framework: string | null,
  rubyCommand: string,
  filePath: string
): string {
  switch (framework) {
    case 'minitest':
      return `${rubyCommand} ${filePath}`
    default:
      return `${rubyCommand} -S rspec ${filePath} --format json`
  }
}

/**
 * Returns the file extension for export based on framework.
 */
export function getExportExtension(framework: string | null): string {
  switch (framework) {
    case 'cucumber':
      return 'feature'
    default:
      return 'rb'
  }
}

/**
 * Returns the file filter for save dialogs based on framework.
 */
export function getExportFilters(
  framework: string | null
): { name: string; extensions: string[] }[] {
  switch (framework) {
    case 'cucumber':
      return [
        { name: 'Cucumber Features', extensions: ['feature'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    default:
      return [
        { name: 'Ruby Scripts', extensions: ['rb'] },
        { name: 'All Files', extensions: ['*'] }
      ]
  }
}
