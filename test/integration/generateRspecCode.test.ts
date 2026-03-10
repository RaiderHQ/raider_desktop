import { describe, it, expect } from 'vitest'
import { generateRspecCode } from '../../src/main/handlers/runRecording'

describe('generateRspecCode (integration)', () => {
  it('includes the test name in the describe block', () => {
    const code = generateRspecCode('Login flow', [], 0, 30)
    expect(code).toContain("describe 'Login flow' do")
  })

  it('includes the implicit wait value', () => {
    const code = generateRspecCode('t', [], 5, 30)
    expect(code).toContain('implicit_wait = 5')
  })

  it('includes the explicit wait value', () => {
    const code = generateRspecCode('t', [], 0, 60)
    expect(code).toContain('timeout: 60')
  })

  it('includes the steps indented inside the it block', () => {
    const code = generateRspecCode('t', ['@driver.get("http://x.com")', '@driver.find_element(:css, "#btn").click'], 0, 30)
    expect(code).toContain('@driver.get("http://x.com")')
    expect(code).toContain('@driver.find_element(:css, "#btn").click')
  })

  it('inserts a sleep(1) between each step', () => {
    const code = generateRspecCode('t', ['step_one', 'step_two'], 0, 30)
    // sleep(1) between steps
    expect(code).toContain('sleep(1)')
  })

  it('produces valid require statements', () => {
    const code = generateRspecCode('t', [], 0, 30)
    expect(code).toContain("require 'selenium-webdriver'")
    expect(code).toContain("require 'rspec'")
  })

  it('includes before and after hooks', () => {
    const code = generateRspecCode('t', [], 0, 30)
    expect(code).toContain('before(:each) do')
    expect(code).toContain('after(:each) do')
  })

  it('works with an empty steps array', () => {
    const code = generateRspecCode('empty test', [], 0, 30)
    expect(code).toContain("describe 'empty test' do")
    expect(code).toContain("it 'plays back the recorded steps' do")
  })
})
