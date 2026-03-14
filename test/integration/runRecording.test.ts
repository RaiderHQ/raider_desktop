import { describe, it, expect, vi, beforeEach } from 'vitest'
import { exec } from 'child_process'
import { promises as fs } from 'fs'

vi.mock('child_process', () => {
  const exec = vi.fn()
  return { exec, default: { exec } }
})

vi.mock('fs', () => {
  const promises = {
    writeFile: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined)
  }
  return { default: { promises }, promises }
})

import runRecording, { generateRspecCode } from '../../src/main/handlers/testing/runRecording'

const mockExec = exec as ReturnType<typeof vi.fn>
const mockWriteFile = fs.writeFile as ReturnType<typeof vi.fn>

describe('generateRspecCode (backward compat)', () => {
  it('generates rspec code with selenium defaults', () => {
    const code = generateRspecCode('My Test', ['@driver.get("https://example.com")'], 5, 10)
    expect(code).toContain("require 'selenium-webdriver'")
    expect(code).toContain("require 'rspec'")
    expect(code).toContain("describe 'My Test'")
    expect(code).toContain('implicit_wait = 5')
    expect(code).toContain('timeout: 10')
  })
})

describe('runRecording', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns error when no test is saved', async () => {
    const result = await runRecording({
      savedTest: null,
      implicitWait: 5,
      explicitWait: 10,
      projectPath: '/project',
      rubyCommand: 'ruby'
    })
    expect(result.success).toBe(false)
    expect(result.output).toContain('No test has been saved')
  })

  it('generates and executes rspec test by default', async () => {
    mockExec.mockImplementation((_cmd: string, _opts: object, cb: Function) => {
      cb(null, '{"examples": []}', '')
    })

    const result = await runRecording({
      savedTest: { name: 'Login', steps: ['@driver.get("https://example.com")'] },
      implicitWait: 5,
      explicitWait: 10,
      projectPath: '/project',
      rubyCommand: 'ruby'
    })

    expect(result.success).toBe(true)
    const calledCmd = mockExec.mock.calls[0][0] as string
    expect(calledCmd).toContain('-S rspec')
    expect(calledCmd).toContain('--format json')
  })

  it('generates and executes minitest test when framework is minitest', async () => {
    mockExec.mockImplementation((_cmd: string, _opts: object, cb: Function) => {
      cb(null, '1 tests, 0 failures', '')
    })

    const result = await runRecording({
      savedTest: { name: 'Login', steps: ['step1'] },
      implicitWait: 5,
      explicitWait: 10,
      projectPath: '/project',
      rubyCommand: 'ruby',
      projectFramework: 'minitest'
    })

    expect(result.success).toBe(true)
    const calledCmd = mockExec.mock.calls[0][0] as string
    expect(calledCmd).not.toContain('rspec')
    expect(calledCmd).toContain('ruby')
  })

  it('returns failure with stderr on exec error', async () => {
    mockExec.mockImplementation((_cmd: string, _opts: object, cb: Function) => {
      cb(new Error('fail'), '', 'test failed')
    })

    const result = await runRecording({
      savedTest: { name: 'T', steps: ['step'] },
      implicitWait: 5,
      explicitWait: 10,
      projectPath: '/p',
      rubyCommand: 'ruby'
    })

    expect(result.success).toBe(false)
    expect(result.output).toContain('STDERR')
    expect(result.output).toContain('test failed')
  })

  it('passes automation framework to test code generation', async () => {
    mockExec.mockImplementation((_cmd: string, _opts: object, cb: Function) => {
      cb(null, 'ok', '')
    })

    await runRecording({
      savedTest: { name: 'T', steps: ['find(".btn").click'] },
      implicitWait: 5,
      explicitWait: 10,
      projectPath: '/p',
      rubyCommand: 'ruby',
      projectAutomation: 'capybara',
      projectFramework: 'rspec'
    })

    const writtenCode = mockWriteFile.mock.calls[0][1] as string
    expect(writtenCode).toContain('capybara')
  })
})
