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
vi.mock('../../src/main/handlers/appState', () => ({
  appState: {
    mainWindow: null,
    projectAutomation: null,
    sessionUrl: null,
    activeReplayProcess: null,
    recorderSettings: {
      baseUrl: 'http://base',
      browser: 'chrome',
      headless: false,
      implicitWait: 3,
      explicitWait: 20,
      selectorPriority: []
    }
  }
}))
vi.mock('../../src/main/handlers/recording/startRecordingMain', () => ({
  default: vi.fn(() => ({ success: true, url: 'http://x', preloadPath: '/p' }))
}))

import replayStepsAndRecord from '../../src/main/handlers/recording/replayStepsAndRecord'
import { appState } from '../../src/main/handlers/appState'
import type { Step } from '../../src/shared/types/step'

const mockExec = exec as ReturnType<typeof vi.fn>
const mockWriteFile = fs.writeFile as ReturnType<typeof vi.fn>

const click = (id: string, value: string): Step => ({
  id,
  kind: 'click',
  element: { strategy: 'id', value }
})

describe('replayStepsAndRecord', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    appState.projectAutomation = null
  })

  it('replays the steps via a generated rspec file without sleeps', async () => {
    mockExec.mockImplementation(
      (
        _cmd: string,
        _opts: object,
        cb: (err: Error | null, stdout: string, stderr: string) => void
      ) => cb(null, 'RAIDER_FINAL_URL:http://final/page\n', '')
    )
    const result = await replayStepsAndRecord(
      {} as never,
      'T',
      [click('1', 'a'), click('2', 'b')],
      'ruby'
    )

    const code = mockWriteFile.mock.calls[0][1] as string
    expect(code).toContain("'--headless=new'")
    expect(code).toContain("@driver.find_element(id: 'a').click")
    expect(code).toContain("@driver.find_element(id: 'b').click")
    expect(code).toContain('puts "RAIDER_FINAL_URL:#{@driver.current_url}"')
    expect(code).toContain('implicit_wait = 3')
    expect(code).not.toContain('sleep(')
    expect(mockExec.mock.calls[0][0]).toMatch(/^ruby -S rspec .*\.rb$/)
    expect(appState.sessionUrl).toBe('http://final/page')
    expect(result.success).toBe(true)
  })

  it('replays with Watir and reads the final URL from @browser on a Watir project', async () => {
    appState.projectAutomation = 'watir'
    mockExec.mockImplementation(
      (
        _cmd: string,
        _opts: object,
        cb: (err: Error | null, stdout: string, stderr: string) => void
      ) => cb(null, 'RAIDER_FINAL_URL:http://final/watir\n', '')
    )
    const result = await replayStepsAndRecord({} as never, 'T', [click('1', 'a')], 'ruby')

    const code = mockWriteFile.mock.calls[0][1] as string
    expect(code).toContain("require 'watir'")
    expect(code).toContain("@browser.element(id: 'a').click")
    expect(code).toContain('puts "RAIDER_FINAL_URL:#{@browser.url}"')
    expect(code).not.toContain('@driver')
    expect(appState.sessionUrl).toBe('http://final/watir')
    expect(result.success).toBe(true)
  })

  it('reports a failed replay', async () => {
    mockExec.mockImplementation(
      (
        _cmd: string,
        _opts: object,
        cb: (err: Error | null, stdout: string, stderr: string) => void
      ) => cb(Object.assign(new Error('x'), { code: 1 }), 'Failure/Error: boom', '')
    )
    const result = await replayStepsAndRecord({} as never, 'T', [], 'ruby')
    expect(result.success).toBe(false)
    expect(result.error).toContain('boom')
  })
})
