import { describe, it, expect, vi, beforeEach } from 'vitest'
import { exec } from 'child_process'
import { promises as fs } from 'fs'
import os from 'os'

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
      selectorPriority: [],
      testIdAttribute: 'data-testid'
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
  })

  it('refuses a ruby command with shell characters and runs nothing', async () => {
    const result = await replayStepsAndRecord({} as never, 'T', [], 'ruby; touch /tmp/x #')
    expect(result.success).toBe(false)
    expect(mockExec).not.toHaveBeenCalled()
  })

  it('refuses steps that are not valid Steps and runs nothing', async () => {
    const bad = [{ id: '1', kind: 'custom', code: 'system("id")', extra: 1 }, { kind: 'click' }]
    const result = await replayStepsAndRecord({} as never, 'T', bad as never, 'ruby')
    expect(result).toEqual({
      success: false,
      error: 'The steps are not valid, so the replay did not run.'
    })
    expect(mockExec).not.toHaveBeenCalled()
    expect(mockWriteFile).not.toHaveBeenCalled()
    const notAList = await replayStepsAndRecord({} as never, 'T', 'x' as never, 'ruby')
    expect(notAList.success).toBe(false)
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
    expect(code).toContain('Raider.timeout = 20')
    expect(code).toContain("require 'ruby_raider/runtime/rspec'")
    expect(code).not.toContain('implicit_wait')
    expect(code).not.toContain('sleep(')
    expect(mockExec.mock.calls[0][0]).toMatch(/^ruby -S rspec .*\.rb$/)
    expect(appState.sessionUrl).toBe('http://final/page')
    expect(result.success).toBe(true)
  })

  it('quotes the temp spec path, which can hold a space or $ in the user name', async () => {
    vi.spyOn(os, 'tmpdir').mockReturnValueOnce("/Users/Jo Ann's $HOME/tmp")
    mockExec.mockImplementation(
      (
        _cmd: string,
        _opts: object,
        cb: (err: Error | null, stdout: string, stderr: string) => void
      ) => cb(null, '', '')
    )
    await replayStepsAndRecord({} as never, 'T', [click('1', 'a')], 'ruby')
    const tempFile = mockWriteFile.mock.calls[0][0] as string
    expect(tempFile.startsWith("/Users/Jo Ann's $HOME/tmp/")).toBe(true)
    expect(mockExec.mock.calls[0][0]).toBe(`ruby -S rspec '${tempFile.replace(/'/g, `'\\''`)}'`)
  })

  it('refuses to replay a secret step whose variable is not set, and runs nothing', async () => {
    delete process.env.RAIDER_SECRET_1
    const secret: Step = {
      id: 's',
      kind: 'type',
      element: { strategy: 'id', value: 'pw' },
      text: '',
      secret: true
    }
    const result = await replayStepsAndRecord({} as never, 'T', [secret], 'ruby')
    expect(result.success).toBe(false)
    expect(result.error).toContain('RAIDER_SECRET_1')
    expect(mockExec).not.toHaveBeenCalled()
  })

  it('refuses a secret step that reads a variable other than RAIDER_SECRET_', async () => {
    process.env.RAIDER_TOKEN = 'hideout-token'
    try {
      const bad = {
        id: 's',
        kind: 'type',
        element: { strategy: 'id', value: 'pw' },
        text: '',
        secret: true,
        secretName: 'RAIDER_TOKEN'
      } as Step
      const result = await replayStepsAndRecord({} as never, 'T', [bad], 'ruby')
      expect(result.success).toBe(false)
      expect(result.error).toContain('RAIDER_TOKEN')
      expect(mockExec).not.toHaveBeenCalled()
      expect(mockWriteFile).not.toHaveBeenCalled()
    } finally {
      delete process.env.RAIDER_TOKEN
    }
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
