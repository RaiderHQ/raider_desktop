import { describe, it, expect } from 'vitest'
import xpathParser from '../../src/main/handlers/xpathParser'

describe('xpathParser (integration)', () => {
  it('parses xpath click with single quotes', () => {
    const result = xpathParser("@driver.find_element(:xpath, '//button').click")
    expect(result).toEqual({
      key: 'recorder.commandParser.clickElement',
      values: { strategy: 'xpath', value: '//button' }
    })
  })

  it('parses xpath click with double quotes', () => {
    const result = xpathParser('@driver.find_element(:xpath, "//button").click')
    expect(result).toEqual({
      key: 'recorder.commandParser.clickElement',
      values: { strategy: 'xpath', value: '//button' }
    })
  })

  it('parses xpath click with concat', () => {
    const result = xpathParser("@driver.find_element(:xpath, concat('//div',\"'\")).click")
    expect(result).toEqual({
      key: 'recorder.commandParser.clickElement',
      values: { strategy: 'xpath', value: "'//div',\"'\"" }
    })
  })

  it('parses xpath typeText with single quotes', () => {
    const result = xpathParser("@driver.find_element(:xpath, '//input').send_keys(\"hello\")")
    expect(result).toEqual({
      key: 'recorder.commandParser.typeText',
      values: { strategy: 'xpath', value: '//input', text: 'hello' }
    })
  })

  it('parses xpath waitForElementDisplayed with single quotes', () => {
    const result = xpathParser("@wait.until { @driver.find_element(:xpath, '//el').displayed? }")
    expect(result).toEqual({
      key: 'recorder.commandParser.waitForElementDisplayed',
      values: { strategy: 'xpath', value: '//el' }
    })
  })

  it('parses xpath waitForElementDisplayed with double quotes', () => {
    const result = xpathParser('@wait.until { @driver.find_element(:xpath, "//el").displayed? }')
    expect(result).toEqual({
      key: 'recorder.commandParser.waitForElementDisplayed',
      values: { strategy: 'xpath', value: '//el' }
    })
  })

  it('parses xpath assertElementDisplayed with single quotes', () => {
    const result = xpathParser("expect(@driver.find_element(:xpath, '//el')).to be_displayed")
    expect(result).toEqual({
      key: 'recorder.commandParser.assertElementDisplayed',
      values: { strategy: 'xpath', value: '//el' }
    })
  })

  it('parses xpath assertElementEnabled', () => {
    const result = xpathParser("expect(@driver.find_element(:xpath, '//btn')).to be_enabled")
    expect(result).toEqual({
      key: 'recorder.commandParser.assertElementEnabled',
      values: { strategy: 'xpath', value: '//btn' }
    })
  })

  it('parses xpath assertElementTextEquals', () => {
    const result = xpathParser(
      "expect(@driver.find_element(:xpath, '//h1').text).to eq(\"Welcome\")"
    )
    expect(result).toEqual({
      key: 'recorder.commandParser.assertElementTextEquals',
      values: { strategy: 'xpath', value: '//h1', text: 'Welcome' }
    })
  })

  it('returns the raw command for unrecognized patterns', () => {
    const raw = '@driver.unknown_xpath_command'
    expect(xpathParser(raw)).toBe(raw)
  })
})
