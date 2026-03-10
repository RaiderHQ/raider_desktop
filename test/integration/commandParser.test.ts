import { describe, it, expect } from 'vitest'
import commandParser from '../../src/main/handlers/commandParser'

describe('commandParser (integration)', () => {
  it('parses @driver.get as a visit command', () => {
    const result = commandParser('@driver.get("https://google.com")')
    expect(result).toEqual({
      key: 'recorder.commandParser.visit',
      values: { url: 'https://google.com' }
    })
  })

  it('parses find_element.click as clickElement', () => {
    const result = commandParser('@driver.find_element(:css, "#btn").click')
    expect(result).toEqual({
      key: 'recorder.commandParser.clickElement',
      values: { strategy: 'css', value: '#btn' }
    })
  })

  it('parses find_element.click with id strategy', () => {
    const result = commandParser('@driver.find_element(:id, "submit").click')
    expect(result).toEqual({
      key: 'recorder.commandParser.clickElement',
      values: { strategy: 'id', value: 'submit' }
    })
  })

  it('parses send_keys with a text string as typeText', () => {
    const result = commandParser('@driver.find_element(:css, "#input").send_keys("hello")')
    expect(result).toEqual({
      key: 'recorder.commandParser.typeText',
      values: { text: 'hello', strategy: 'css', value: '#input' }
    })
  })

  it('parses send_keys with a symbol as pressKey', () => {
    const result = commandParser('@driver.find_element(:css, "#input").send_keys(:return)')
    expect(result).toEqual({
      key: 'recorder.commandParser.pressKey',
      values: { key: 'return', strategy: 'css', value: '#input' }
    })
  })

  it('parses sleep as a wait command', () => {
    const result = commandParser('sleep(2)')
    expect(result).toEqual({
      key: 'recorder.commandParser.wait',
      values: { seconds: '2' }
    })
  })

  it('parses execute_script', () => {
    const result = commandParser('@driver.execute_script("window.scrollTo(0,0)")')
    expect(result).toEqual({
      key: 'recorder.commandParser.executeScript',
      values: { script: 'window.scrollTo(0,0)' }
    })
  })

  it('parses switch_to.frame', () => {
    const result = commandParser('@driver.switch_to.frame(0)')
    expect(result).toEqual({
      key: 'recorder.commandParser.switchToFrame',
      values: { frame: '0' }
    })
  })

  it('parses switch_to.default_content', () => {
    const result = commandParser('@driver.switch_to.default_content')
    expect(result).toEqual({
      key: 'recorder.commandParser.switchToDefaultContent',
      values: {}
    })
  })

  it('parses wait.until displayed assertion', () => {
    const result = commandParser('@wait.until { @driver.find_element(:css, "#el").displayed? }')
    expect(result).toEqual({
      key: 'recorder.commandParser.waitForElementDisplayed',
      values: { strategy: 'css', value: '#el' }
    })
  })

  it('parses wait.until enabled assertion', () => {
    const result = commandParser('@wait.until { @driver.find_element(:css, "#el").enabled? }')
    expect(result).toEqual({
      key: 'recorder.commandParser.waitForElementEnabled',
      values: { strategy: 'css', value: '#el' }
    })
  })

  it('parses expect be_displayed assertion', () => {
    const result = commandParser('expect(@driver.find_element(:css, "#el")).to be_displayed')
    expect(result).toEqual({
      key: 'recorder.commandParser.assertElementDisplayed',
      values: { strategy: 'css', value: '#el' }
    })
  })

  it('parses expect be_enabled assertion', () => {
    const result = commandParser('expect(@driver.find_element(:css, "#el")).to be_enabled')
    expect(result).toEqual({
      key: 'recorder.commandParser.assertElementEnabled',
      values: { strategy: 'css', value: '#el' }
    })
  })

  it('parses expect text equals assertion', () => {
    const result = commandParser(
      'expect(@driver.find_element(:css, "#el").text).to eq("expected text")'
    )
    expect(result).toEqual({
      key: 'recorder.commandParser.assertElementTextEquals',
      values: { strategy: 'css', value: '#el', text: 'expected text' }
    })
  })

  it('returns the raw command string for unrecognized patterns', () => {
    const raw = '@driver.some_unknown_method'
    expect(commandParser(raw)).toBe(raw)
  })
})
