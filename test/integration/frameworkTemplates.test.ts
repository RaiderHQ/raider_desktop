import { describe, it, expect } from 'vitest'
import {
  generateSeleniumCommand,
  generateCapybaraCommand,
  generateWatirCommand,
  generateCommand,
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
// Export settings
// ---------------------------------------------------------------------------

describe('getExportExtension', () => {
  it('returns "rb" for cucumber until feature generation lands', () => {
    expect(getExportExtension('cucumber')).toBe('rb')
  })

  it('returns "rb" for rspec', () => {
    expect(getExportExtension('rspec')).toBe('rb')
  })

  it('returns "rb" for null', () => {
    expect(getExportExtension(null)).toBe('rb')
  })
})

describe('getExportFilters', () => {
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
