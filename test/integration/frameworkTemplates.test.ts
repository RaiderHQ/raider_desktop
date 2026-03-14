import { describe, it, expect } from 'vitest'
import {
  generateSeleniumCommand,
  generateCapybaraCommand,
  generateWatirCommand,
  generateCommand,
  generateRspecExport,
  generateMinitestExport,
  generateCucumberExport,
  generateExportContent,
  generateRspecTestCode,
  generateMinitestTestCode,
  generateTestCode,
  getTestRunCommand,
  getExportExtension,
  getExportFilters,
  type RecorderAction
} from '../../src/main/handlers/frameworkTemplates'

// ---------------------------------------------------------------------------
// Recorder command generation
// ---------------------------------------------------------------------------

describe('generateSeleniumCommand', () => {
  const baseAction: RecorderAction = {
    action: 'click',
    selector: '#login-btn',
    strategy: 'css',
    tagName: 'BUTTON'
  }

  it('generates click command', () => {
    const result = generateSeleniumCommand(baseAction)
    expect(result).toContain('@driver.find_element(:css')
    expect(result).toContain('.click')
    expect(result).toContain('Clicked <button>')
  })

  it('generates type command with clear + send_keys', () => {
    const action: RecorderAction = { ...baseAction, action: 'type', value: 'hello' }
    const result = generateSeleniumCommand(action)
    expect(result).toContain('.clear')
    expect(result).toContain('.send_keys("hello")')
  })

  it('includes typed value in send_keys', () => {
    const action: RecorderAction = { ...baseAction, action: 'type', value: 'say hi' }
    const result = generateSeleniumCommand(action)
    expect(result).toContain('.send_keys("say hi")')
  })

  it('generates sendKeys command for Enter key', () => {
    const action: RecorderAction = { ...baseAction, action: 'sendKeys', value: 'Enter' }
    const result = generateSeleniumCommand(action)
    expect(result).toContain(':enter')
    expect(result).toContain('Pressed Enter')
  })

  it('generates sendKeys command for Tab key', () => {
    const action: RecorderAction = { ...baseAction, action: 'sendKeys', value: 'Tab' }
    const result = generateSeleniumCommand(action)
    expect(result).toContain(':tab')
  })

  it('generates sendKeys command for arrow keys', () => {
    const action: RecorderAction = { ...baseAction, action: 'sendKeys', value: 'ArrowDown' }
    const result = generateSeleniumCommand(action)
    expect(result).toContain(':arrow_down')
  })

  it('returns empty string for unmapped sendKeys value', () => {
    const action: RecorderAction = { ...baseAction, action: 'sendKeys', value: 'UnknownKey' }
    const result = generateSeleniumCommand(action)
    expect(result).toBe('')
  })

  it('uses id strategy correctly', () => {
    const action: RecorderAction = { ...baseAction, strategy: 'id', selector: 'username' }
    const result = generateSeleniumCommand(action)
    expect(result).toContain(':id')
    expect(result).toContain('"username"')
  })
})

describe('generateCapybaraCommand', () => {
  const baseAction: RecorderAction = {
    action: 'click',
    selector: '#submit',
    strategy: 'css',
    tagName: 'BUTTON'
  }

  it('generates click command with css selector', () => {
    const result = generateCapybaraCommand(baseAction)
    expect(result).toContain('find(')
    expect(result).toContain('.click')
  })

  it('generates type command with fill_in for id strategy', () => {
    const action: RecorderAction = {
      action: 'type',
      selector: 'email',
      strategy: 'id',
      tagName: 'INPUT',
      value: 'test@example.com'
    }
    const result = generateCapybaraCommand(action)
    expect(result).toContain('fill_in "email"')
    expect(result).toContain('with: "test@example.com"')
  })

  it('generates type command with set for css strategy', () => {
    const action: RecorderAction = { ...baseAction, action: 'type', value: 'text' }
    const result = generateCapybaraCommand(action)
    expect(result).toContain('.set("")')
    expect(result).toContain('.set("text")')
  })

  it('generates sendKeys command', () => {
    const action: RecorderAction = { ...baseAction, action: 'sendKeys', value: 'Enter' }
    const result = generateCapybaraCommand(action)
    expect(result).toContain('send_keys(:enter)')
  })
})

describe('generateWatirCommand', () => {
  const baseAction: RecorderAction = {
    action: 'click',
    selector: 'login',
    strategy: 'id',
    tagName: 'BUTTON'
  }

  it('generates click command with id selector', () => {
    const result = generateWatirCommand(baseAction)
    expect(result).toContain('browser.element(id: "login")')
    expect(result).toContain('.click')
  })

  it('generates click command with css selector', () => {
    const action: RecorderAction = { ...baseAction, strategy: 'css', selector: '.btn' }
    const result = generateWatirCommand(action)
    expect(result).toContain('css: ".btn"')
  })

  it('generates type command with clear + send_keys', () => {
    const action: RecorderAction = { ...baseAction, action: 'type', value: 'password' }
    const result = generateWatirCommand(action)
    expect(result).toContain('.clear')
    expect(result).toContain('.send_keys("password")')
  })

  it('generates sendKeys for mapped keys', () => {
    const action: RecorderAction = { ...baseAction, action: 'sendKeys', value: 'Escape' }
    const result = generateWatirCommand(action)
    expect(result).toContain(':escape')
  })

  it('returns empty for unknown keys', () => {
    const action: RecorderAction = { ...baseAction, action: 'sendKeys', value: 'Mystery' }
    const result = generateWatirCommand(action)
    expect(result).toBe('')
  })
})

describe('generateCommand (dispatcher)', () => {
  const action: RecorderAction = {
    action: 'click',
    selector: '#btn',
    strategy: 'css',
    tagName: 'BUTTON'
  }

  it('dispatches to capybara', () => {
    const result = generateCommand('capybara', action)
    expect(result).toContain('find(')
  })

  it('dispatches to watir', () => {
    const result = generateCommand('watir', action)
    expect(result).toContain('browser.element')
  })

  it('defaults to selenium for null', () => {
    const result = generateCommand(null, action)
    expect(result).toContain('@driver.find_element')
  })

  it('defaults to selenium for unknown value', () => {
    const result = generateCommand('unknown', action)
    expect(result).toContain('@driver.find_element')
  })
})

// ---------------------------------------------------------------------------
// Export templates
// ---------------------------------------------------------------------------

describe('generateRspecExport', () => {
  it('generates valid rspec export with selenium', () => {
    const result = generateRspecExport({
      testName: 'Login Test',
      steps: ['@driver.get("https://example.com")'],
      automation: null
    })
    expect(result).toContain("require 'selenium-webdriver'")
    expect(result).toContain('Starting test: Login Test')
    expect(result).toContain('driver.quit')
  })

  it('generates capybara export', () => {
    const result = generateRspecExport({
      testName: 'Test',
      steps: ['visit("/")'],
      automation: 'capybara'
    })
    expect(result).toContain("require 'capybara/dsl'")
    expect(result).toContain('Capybara.default_driver')
    expect(result).toContain('Capybara.current_session.driver.quit')
  })

  it('generates watir export', () => {
    const result = generateRspecExport({
      testName: 'Test',
      steps: ['browser.goto("https://example.com")'],
      automation: 'watir'
    })
    expect(result).toContain("require 'watir'")
    expect(result).toContain('Watir::Browser.new')
    expect(result).toContain('browser.close')
  })

  it('includes suite name when provided', () => {
    const result = generateRspecExport({
      testName: 'Test',
      suiteName: 'My Suite',
      steps: [],
      automation: null
    })
    expect(result).toContain('# Suite: My Suite')
  })
})

describe('generateMinitestExport', () => {
  it('generates a valid minitest class', () => {
    const result = generateMinitestExport({
      testName: 'Login Test',
      steps: ['@driver.get("https://example.com")'],
      automation: null
    })
    expect(result).toContain("require 'minitest/autorun'")
    expect(result).toContain('class TestLoginTest < Minitest::Test')
    expect(result).toContain('def setup')
    expect(result).toContain('def teardown')
    expect(result).toContain('def test_login_test')
    expect(result).toContain('@driver = Selenium::WebDriver.for :chrome')
  })

  it('sanitizes class name from special characters', () => {
    const result = generateMinitestExport({
      testName: 'my-test #1',
      steps: [],
      automation: null
    })
    expect(result).toContain('class Testmytest1')
    expect(result).toContain('def test_my_test__1')
  })

  it('uses capybara setup when automation is capybara', () => {
    const result = generateMinitestExport({
      testName: 'Test',
      steps: [],
      automation: 'capybara'
    })
    expect(result).toContain('Capybara.default_driver = :selenium_chrome')
    expect(result).toContain('Capybara.current_session.driver.quit')
  })

  it('uses watir setup when automation is watir', () => {
    const result = generateMinitestExport({
      testName: 'Test',
      steps: [],
      automation: 'watir'
    })
    expect(result).toContain('@browser = Watir::Browser.new :chrome')
    expect(result).toContain('@browser.close')
  })
})

describe('generateCucumberExport', () => {
  it('generates a cucumber feature file', () => {
    const result = generateCucumberExport({
      testName: 'Checkout Flow',
      steps: ['visit("/cart")', 'click_button("Pay")'],
      automation: null
    })
    expect(result).toContain('Feature: Checkout Flow')
    expect(result).toContain('Scenario: Checkout Flow')
    expect(result).toContain('Given I start the test')
    expect(result).toContain('# Step 1')
    expect(result).toContain('# Step 2')
  })
})

describe('generateExportContent (dispatcher)', () => {
  const params = { testName: 'T', steps: ['step1'], automation: null }

  it('dispatches to minitest', () => {
    const result = generateExportContent('minitest', params)
    expect(result).toContain('Minitest::Test')
  })

  it('dispatches to cucumber', () => {
    const result = generateExportContent('cucumber', params)
    expect(result).toContain('Feature:')
  })

  it('defaults to rspec', () => {
    const result = generateExportContent(null, params)
    expect(result).toContain('selenium-webdriver')
  })

  it('defaults to rspec for unknown framework', () => {
    const result = generateExportContent('unknown', params)
    expect(result).toContain('selenium-webdriver')
  })
})

// ---------------------------------------------------------------------------
// Test execution code generation
// ---------------------------------------------------------------------------

describe('generateRspecTestCode', () => {
  it('generates rspec test with selenium setup', () => {
    const result = generateRspecTestCode({
      testName: 'Login',
      steps: ['@driver.get("https://example.com")'],
      implicitWait: 5,
      explicitWait: 10,
      automation: null
    })
    expect(result).toContain("require 'selenium-webdriver'")
    expect(result).toContain("require 'rspec'")
    expect(result).toContain("describe 'Login'")
    expect(result).toContain('implicit_wait = 5')
    expect(result).toContain('timeout: 10')
    expect(result).toContain('@driver.quit')
  })

  it('generates rspec test with capybara setup', () => {
    const result = generateRspecTestCode({
      testName: 'T',
      steps: [],
      implicitWait: 3,
      explicitWait: 8,
      automation: 'capybara'
    })
    expect(result).toContain('Capybara.default_driver = :selenium_chrome')
    expect(result).toContain(`wait: 8`)
  })

  it('generates rspec test with watir setup', () => {
    const result = generateRspecTestCode({
      testName: 'T',
      steps: [],
      implicitWait: 4,
      explicitWait: 12,
      automation: 'watir'
    })
    expect(result).toContain('Watir::Browser.new :chrome')
    expect(result).toContain('implicit_wait = 4')
    expect(result).toContain('timeout: 12')
  })
})

describe('generateMinitestTestCode', () => {
  it('generates minitest class with selenium', () => {
    const result = generateMinitestTestCode({
      testName: 'Signup',
      steps: ['@driver.get("/signup")'],
      implicitWait: 5,
      explicitWait: 10,
      automation: null
    })
    expect(result).toContain("require 'minitest/autorun'")
    expect(result).toContain('class TestSignup < Minitest::Test')
    expect(result).toContain('def test_signup')
    expect(result).toContain('implicit_wait = 5')
  })

  it('generates minitest class with capybara', () => {
    const result = generateMinitestTestCode({
      testName: 'T',
      steps: [],
      implicitWait: 1,
      explicitWait: 2,
      automation: 'capybara'
    })
    expect(result).toContain('Capybara.default_driver')
  })
})

describe('generateTestCode (dispatcher)', () => {
  const params = { testName: 'T', steps: [], implicitWait: 5, explicitWait: 10, automation: null }

  it('dispatches to minitest', () => {
    expect(generateTestCode('minitest', params)).toContain('Minitest::Test')
  })

  it('defaults to rspec', () => {
    expect(generateTestCode(null, params)).toContain("require 'rspec'")
  })

  it('defaults to rspec for unknown framework', () => {
    expect(generateTestCode('unknown', params)).toContain("require 'rspec'")
  })
})

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

describe('getTestRunCommand', () => {
  it('returns minitest command', () => {
    expect(getTestRunCommand('minitest', 'ruby', '/tmp/test.rb')).toBe('ruby /tmp/test.rb')
  })

  it('returns rspec command for null framework', () => {
    const result = getTestRunCommand(null, 'ruby', '/tmp/test.rb')
    expect(result).toContain('-S rspec')
    expect(result).toContain('--format json')
  })

  it('returns rspec command for unknown framework', () => {
    const result = getTestRunCommand('unknown', 'ruby', '/tmp/test.rb')
    expect(result).toContain('-S rspec')
  })
})

describe('getExportExtension', () => {
  it('returns "feature" for cucumber', () => {
    expect(getExportExtension('cucumber')).toBe('feature')
  })

  it('returns "rb" for rspec', () => {
    expect(getExportExtension('rspec')).toBe('rb')
  })

  it('returns "rb" for null', () => {
    expect(getExportExtension(null)).toBe('rb')
  })
})

describe('getExportFilters', () => {
  it('returns cucumber filters', () => {
    const filters = getExportFilters('cucumber')
    expect(filters[0].name).toBe('Cucumber Features')
    expect(filters[0].extensions).toContain('feature')
  })

  it('returns ruby filters for rspec', () => {
    const filters = getExportFilters('rspec')
    expect(filters[0].name).toBe('Ruby Scripts')
    expect(filters[0].extensions).toContain('rb')
  })

  it('returns ruby filters for null', () => {
    const filters = getExportFilters(null)
    expect(filters[0].extensions).toContain('rb')
  })
})
