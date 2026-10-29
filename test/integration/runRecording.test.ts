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

import { generateRspecFile } from '../../src/main/codegen/testFile'
import { migrateLegacyTest } from '../../src/main/codegen/legacy'
import runRecording from '../../src/main/handlers/testing/runRecording'

const mockExec = exec as ReturnType<typeof vi.fn>
const mockWriteFile = fs.writeFile as ReturnType<typeof vi.fn>

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
      savedTest: { id: 't', name: 'Login', url: '', steps: ['@driver.get("https://example.com")'] },
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

  it('writes exactly the generated rspec file and runs rspec with json output', async () => {
    mockExec.mockImplementation((_cmd: string, _opts: object, cb: Function) => {
      cb(null, '{}', '')
    })
    const savedTest = {
      id: 't1',
      name: 'Login',
      url: '',
      steps: ['@driver.find_element(:id, "btn").click']
    }

    await runRecording({
      savedTest,
      implicitWait: 5,
      explicitWait: 10,
      browser: 'firefox',
      headless: true,
      projectPath: '/project',
      rubyCommand: 'ruby',
      projectAutomation: 'watir',
      projectFramework: 'minitest'
    })

    const expected = generateRspecFile(migrateLegacyTest(savedTest), 'watir', {
      browser: 'firefox',
      headless: true,
      implicitWait: 5,
      explicitWait: 10
    })
    expect(mockWriteFile.mock.calls[0][1]).toBe(expected)
    const calledCmd = mockExec.mock.calls[0][0] as string
    expect(calledCmd).toMatch(/^ruby -S rspec .*\.rb --format json$/)
  })

  it('returns failure with stderr on exec error', async () => {
    mockExec.mockImplementation((_cmd: string, _opts: object, cb: Function) => {
      cb(new Error('fail'), '', 'test failed')
    })

    const result = await runRecording({
      savedTest: { id: 't', name: 'T', url: '', steps: ['step'] },
      implicitWait: 5,
      explicitWait: 10,
      projectPath: '/p',
      rubyCommand: 'ruby'
    })

    expect(result.success).toBe(false)
    expect(result.output).toContain('STDERR')
    expect(result.output).toContain('test failed')
  })
})
