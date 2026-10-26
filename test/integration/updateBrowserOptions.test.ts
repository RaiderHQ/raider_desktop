import { describe, it, expect, vi, beforeEach } from 'vitest'
import { IpcMainInvokeEvent } from 'electron'

const { mockSafeExec } = vi.hoisted(() => ({ mockSafeExec: vi.fn() }))

vi.mock('../../src/main/utils/safeExec', () => ({
  safeExec: (...args: unknown[]) => mockSafeExec(...args)
}))
vi.mock('fix-path', () => ({ default: vi.fn() }))

import handler from '../../src/main/handlers/config/updateBrowserOptions'

const mockEvent = {} as IpcMainInvokeEvent

beforeEach(() => {
  vi.clearAllMocks()
  mockSafeExec.mockResolvedValue({ stdout: 'ok', stderr: '', exitCode: 0 })
})

describe('updateBrowserOptions handler', () => {
  it('passes each option as its own quoted argument', async () => {
    await handler(mockEvent, '/project', ['no-sandbox', 'window-size=1280,800'])
    const cmd = mockSafeExec.mock.calls[0][0] as string
    expect(cmd).toContain("raider u browser_options no-sandbox 'window-size=1280,800'")
    expect(cmd).not.toContain('--opts')
  })

  it('quotes options that contain shell metacharacters', async () => {
    await handler(mockEvent, '/project', ['a b', "it's"])
    const cmd = mockSafeExec.mock.calls[0][0] as string
    expect(cmd).toContain("raider u browser_options 'a b' 'it'\\''s'")
  })

  it('uses --delete when the list is empty', async () => {
    await handler(mockEvent, '/project', [])
    const cmd = mockSafeExec.mock.calls[0][0] as string
    expect(cmd).toContain('raider u browser_options --delete')
  })
})
