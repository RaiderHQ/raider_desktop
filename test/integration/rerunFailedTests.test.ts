import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import path from 'path'
import { mkdirSync, rmSync, writeFileSync } from 'fs'
import os from 'os'

const { mockSafeExec, mockCheckBundle, mockBundleInstall } = vi.hoisted(() => ({
  mockSafeExec: vi.fn(),
  mockCheckBundle: vi.fn(),
  mockBundleInstall: vi.fn()
}))

vi.mock('../../src/main/utils/safeExec', () => ({
  safeExec: mockSafeExec
}))

vi.mock('../../src/main/handlers/ruby/checkBundle', () => ({
  default: mockCheckBundle
}))

vi.mock('../../src/main/handlers/ruby/bundleInstall', () => ({
  default: mockBundleInstall
}))

vi.mock('fix-path', () => ({ default: vi.fn() }))
vi.mock('electron', () => ({ BrowserWindow: vi.fn() }))

import handler from '../../src/main/handlers/testing/rerunFailedTests'

const mockMainWindow = {
  webContents: { send: vi.fn() }
} as unknown as Electron.BrowserWindow

// Create real temp directories for framework detection
const tmpBase = path.join(os.tmpdir(), 'raider-rerun-test-' + Date.now())
const rspecProject = path.join(tmpBase, 'rspec_project')
const cucumberProject = path.join(tmpBase, 'cucumber_project')
const cucumberNoRerun = path.join(tmpBase, 'cucumber_no_rerun')
const emptyProject = path.join(tmpBase, 'empty_project')

beforeEach(() => {
  mockSafeExec.mockReset()
  mockCheckBundle.mockReset()
  mockBundleInstall.mockReset()
  ;(mockMainWindow.webContents.send as ReturnType<typeof vi.fn>).mockReset()
  mockCheckBundle.mockResolvedValue({ success: true })
})

// Create real directories once for all tests
mkdirSync(path.join(rspecProject, 'spec'), { recursive: true })
mkdirSync(path.join(cucumberProject, 'features'), { recursive: true })
writeFileSync(path.join(cucumberProject, 'rerun.txt'), 'features/login.feature:5')
mkdirSync(path.join(cucumberNoRerun, 'features'), { recursive: true })
mkdirSync(emptyProject, { recursive: true })

afterAll(() => {
  rmSync(tmpBase, { recursive: true, force: true })
})

describe('rerunFailedTests handler', () => {
  describe('framework detection', () => {
    it('returns error when neither spec/ nor features/ exists', async () => {
      const result = await handler(mockMainWindow, emptyProject, 'ruby')

      expect(result.success).toBe(false)
      expect(result.error).toBe(
        'Could not detect test framework. No spec/ or features/ directory found.'
      )
      expect(mockSafeExec).not.toHaveBeenCalled()
    })
  })

  describe('RSpec path', () => {
    it('runs rspec --only-failures with correct command', async () => {
      mockSafeExec.mockResolvedValue({
        stdout: '3 examples, 1 failure',
        stderr: '',
        exitCode: 0
      })

      const result = await handler(mockMainWindow, rspecProject, 'ruby')

      expect(result.success).toBe(true)
      expect(result.output).toBe('3 examples, 1 failure')

      const [command, options] = mockSafeExec.mock.calls[0]
      expect(command).toBe('ruby -S bundle exec rspec --only-failures')
      expect(options.cwd).toBe(path.resolve(rspecProject))
    })

    it('sends running status before executing', async () => {
      mockSafeExec.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 })

      await handler(mockMainWindow, rspecProject, 'ruby')

      expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
        'test-run-status',
        { status: 'running' }
      )
    })

    it('returns success with output when rspec exits non-zero with test output', async () => {
      mockSafeExec.mockResolvedValue({
        stdout: '3 examples, 2 failures',
        stderr: '',
        exitCode: 1
      })

      const result = await handler(mockMainWindow, rspecProject, 'ruby')

      expect(result.success).toBe(true)
      expect(result.output).toBe('3 examples, 2 failures')
    })

    it('returns failure with stderr when rspec errors', async () => {
      mockSafeExec.mockResolvedValue({
        stdout: '',
        stderr: 'No examples matched',
        exitCode: 1
      })

      const result = await handler(mockMainWindow, rspecProject, 'ruby')

      expect(result.success).toBe(false)
      expect(result.error).toBe('No examples matched')
    })
  })

  describe('Cucumber path', () => {
    it('runs cucumber @rerun.txt with correct command', async () => {
      mockSafeExec.mockResolvedValue({
        stdout: '2 scenarios (1 failed, 1 passed)',
        stderr: '',
        exitCode: 0
      })

      const result = await handler(mockMainWindow, cucumberProject, 'ruby')

      expect(result.success).toBe(true)
      expect(result.output).toBe('2 scenarios (1 failed, 1 passed)')

      const [command, options] = mockSafeExec.mock.calls[0]
      expect(command).toBe('ruby -S bundle exec cucumber @rerun.txt')
      expect(options.cwd).toBe(path.resolve(cucumberProject))
    })

    it('returns error when rerun.txt does not exist', async () => {
      const result = await handler(mockMainWindow, cucumberNoRerun, 'ruby')

      expect(result.success).toBe(false)
      expect(result.error).toBe(
        'No rerun.txt found. Run tests first to generate failure data.'
      )
      expect(mockSafeExec).not.toHaveBeenCalled()
    })
  })

  describe('bundle management', () => {
    it('installs bundle when checkBundle fails', async () => {
      mockCheckBundle.mockResolvedValue({ success: false })
      mockBundleInstall.mockResolvedValue({ success: true })
      mockSafeExec.mockResolvedValue({ stdout: 'ok', stderr: '', exitCode: 0 })

      await handler(mockMainWindow, rspecProject, 'ruby')

      expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
        'test-run-status',
        { status: 'installing' }
      )
      expect(mockBundleInstall).toHaveBeenCalledWith(rspecProject, 'ruby')
    })

    it('returns failure when bundleInstall fails', async () => {
      mockCheckBundle.mockResolvedValue({ success: false })
      mockBundleInstall.mockResolvedValue({ success: false, error: 'gem not found' })

      const result = await handler(mockMainWindow, rspecProject, 'ruby')

      expect(result.success).toBe(false)
      expect(result.error).toContain('Failed to install gems')
      expect(mockSafeExec).not.toHaveBeenCalled()
    })
  })

  describe('exception handling', () => {
    it('catches thrown exceptions and returns error', async () => {
      mockSafeExec.mockRejectedValue(new Error('EACCES: permission denied'))

      const result = await handler(mockMainWindow, rspecProject, 'ruby')

      expect(result.success).toBe(false)
      expect(result.error).toBe('EACCES: permission denied')
    })
  })
})
