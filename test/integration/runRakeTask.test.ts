import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'path'

const mockSafeExec = vi.fn()
vi.mock('../../src/main/utils/safeExec', () => ({
  safeExec: (...args: unknown[]) => mockSafeExec(...args)
}))

const mockCheckBundle = vi.fn()
vi.mock('../../src/main/handlers/ruby/checkBundle', () => ({
  default: (...args: unknown[]) => mockCheckBundle(...args)
}))

const mockBundleInstall = vi.fn()
vi.mock('../../src/main/handlers/ruby/bundleInstall', () => ({
  default: (...args: unknown[]) => mockBundleInstall(...args)
}))

vi.mock('fix-path', () => ({ default: vi.fn() }))

import handler from '../../src/main/handlers/testing/runRakeTask'

const mockMainWindow = {
  webContents: { send: vi.fn() }
} as unknown as Electron.BrowserWindow

beforeEach(() => {
  vi.clearAllMocks()
  mockCheckBundle.mockResolvedValue({ success: true })
})

describe('runRakeTask handler', () => {
  it('runs rake smoke with the correct command', async () => {
    mockSafeExec.mockResolvedValue({
      stdout: '2 examples, 0 failures',
      stderr: '',
      exitCode: 0
    })

    const result = await handler(mockMainWindow, '/project', 'ruby', 'smoke')

    expect(result.success).toBe(true)
    expect(result.output).toBe('2 examples, 0 failures')

    // Verify exact command construction
    expect(mockSafeExec).toHaveBeenCalledTimes(1)
    const [command, options] = mockSafeExec.mock.calls[0]
    expect(command).toBe('ruby -S bundle exec rake smoke')
    expect(options.cwd).toBe(path.resolve('/project'))
    expect(options.timeout).toBe(120_000)
  })

  it('runs rake regression with the correct command', async () => {
    mockSafeExec.mockResolvedValue({
      stdout: '5 examples, 0 failures',
      stderr: '',
      exitCode: 0
    })

    const result = await handler(mockMainWindow, '/project', 'ruby', 'regression')

    expect(result.success).toBe(true)
    const [command] = mockSafeExec.mock.calls[0]
    expect(command).toBe('ruby -S bundle exec rake regression')
  })

  it('sends running status before executing', async () => {
    mockSafeExec.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 })

    await handler(mockMainWindow, '/project', 'ruby', 'smoke')

    expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
      'test-run-status',
      { status: 'running' }
    )
  })

  it('installs bundle when checkBundle fails', async () => {
    mockCheckBundle.mockResolvedValue({ success: false })
    mockBundleInstall.mockResolvedValue({ success: true })
    mockSafeExec.mockResolvedValue({ stdout: 'ok', stderr: '', exitCode: 0 })

    await handler(mockMainWindow, '/project', 'ruby', 'smoke')

    expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
      'test-run-status',
      { status: 'installing' }
    )
    expect(mockBundleInstall).toHaveBeenCalledWith('/project', 'ruby')
    expect(mockSafeExec).toHaveBeenCalledTimes(1)
  })

  it('returns failure when bundleInstall fails', async () => {
    mockCheckBundle.mockResolvedValue({ success: false })
    mockBundleInstall.mockResolvedValue({ success: false, error: 'gem not found' })

    const result = await handler(mockMainWindow, '/project', 'ruby', 'smoke')

    expect(result.success).toBe(false)
    expect(result.error).toContain('Failed to install gems')
    expect(mockSafeExec).not.toHaveBeenCalled()
  })

  it('returns failure with stderr when rake task exits non-zero', async () => {
    mockSafeExec.mockResolvedValue({
      stdout: '',
      stderr: "Don't know how to build task 'nonexistent'",
      exitCode: 1
    })

    const result = await handler(mockMainWindow, '/project', 'ruby', 'nonexistent')

    expect(result.success).toBe(false)
    expect(result.error).toContain("Don't know how to build task")
  })

  it('returns success with output when rake exits non-zero with test output', async () => {
    mockSafeExec.mockResolvedValue({
      stdout: '3 examples, 2 failures',
      stderr: '',
      exitCode: 1
    })

    const result = await handler(mockMainWindow, '/project', 'ruby', 'smoke')

    expect(result.success).toBe(true)
    expect(result.output).toBe('3 examples, 2 failures')
  })

  it('returns generic error when rake exits non-zero with empty output', async () => {
    mockSafeExec.mockResolvedValue({
      stdout: '',
      stderr: '',
      exitCode: 1
    })

    const result = await handler(mockMainWindow, '/project', 'ruby', 'smoke')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Task execution failed with no output.')
  })

  it('catches thrown exceptions and returns error', async () => {
    mockSafeExec.mockRejectedValue(new Error('ENOENT: no such file'))

    const result = await handler(mockMainWindow, '/project', 'ruby', 'smoke')

    expect(result.success).toBe(false)
    expect(result.error).toBe('ENOENT: no such file')
  })
})
