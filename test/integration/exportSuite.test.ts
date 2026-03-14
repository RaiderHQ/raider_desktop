import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  BrowserWindow: {
    getFocusedWindow: vi.fn()
  },
  dialog: {
    showSaveDialog: vi.fn()
  }
}))

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    chmodSync: vi.fn()
  },
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  chmodSync: vi.fn()
}))

vi.mock('../../src/main/handlers/appState', () => ({
  appState: {
    suites: new Map(),
    projectFramework: 'rspec',
    projectAutomation: 'selenium'
  }
}))

vi.mock('../../src/main/handlers/frameworkTemplates', () => ({
  generateExportContent: vi.fn(() => '# generated test content'),
  getExportExtension: vi.fn(() => 'rb')
}))

import { BrowserWindow, dialog } from 'electron'
import fs from 'fs'
import exportSuite from '../../src/main/handlers/io/exportSuite'
import { appState } from '../../src/main/handlers/appState'

const mockGetFocusedWindow = BrowserWindow.getFocusedWindow as ReturnType<typeof vi.fn>
const mockShowSaveDialog = dialog.showSaveDialog as ReturnType<typeof vi.fn>
const mockExistsSync = fs.existsSync as ReturnType<typeof vi.fn>
const mockMkdirSync = fs.mkdirSync as ReturnType<typeof vi.fn>
const mockWriteFileSync = fs.writeFileSync as ReturnType<typeof vi.fn>
const mockChmodSync = fs.chmodSync as ReturnType<typeof vi.fn>

const fakeWindow = { id: 1 }

const fakeSuite = {
  id: 'suite-1',
  name: 'Login Suite',
  tests: [
    { id: 'test-1', name: 'Login test', url: 'http://example.com', steps: ['@driver.get("http://example.com")'] },
    { id: 'test-2', name: 'Logout test', url: 'http://example.com', steps: ['@driver.get("http://example.com/logout")'] }
  ]
}

describe('exportSuite handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetFocusedWindow.mockReturnValue(fakeWindow)
    appState.suites = new Map()
    appState.suites.set('suite-1', fakeSuite)
  })

  it('returns error when no focused window is available', async () => {
    mockGetFocusedWindow.mockReturnValue(null)
    const result = await exportSuite('suite-1')
    expect(result.success).toBe(false)
    expect(result.error).toContain('No focused window')
  })

  it('returns error when suite is not found', async () => {
    const result = await exportSuite('nonexistent')
    expect(result.success).toBe(false)
    expect(result.error).toContain('Suite not found')
  })

  it('returns error when user cancels dialog', async () => {
    mockShowSaveDialog.mockResolvedValue({ canceled: true, filePath: undefined })
    const result = await exportSuite('suite-1')
    expect(result.success).toBe(false)
    expect(result.error).toContain('cancelled')
  })

  it('creates directory if it does not exist', async () => {
    mockShowSaveDialog.mockResolvedValue({ canceled: false, filePath: '/tmp/login_suite' })
    mockExistsSync.mockReturnValue(false)
    await exportSuite('suite-1')
    expect(mockMkdirSync).toHaveBeenCalledWith('/tmp/login_suite')
  })

  it('does not create directory if it already exists', async () => {
    mockShowSaveDialog.mockResolvedValue({ canceled: false, filePath: '/tmp/login_suite' })
    mockExistsSync.mockReturnValue(true)
    await exportSuite('suite-1')
    expect(mockMkdirSync).not.toHaveBeenCalled()
  })

  it('writes a file for each test in the suite', async () => {
    mockShowSaveDialog.mockResolvedValue({ canceled: false, filePath: '/tmp/login_suite' })
    mockExistsSync.mockReturnValue(true)
    const result = await exportSuite('suite-1')
    expect(result.success).toBe(true)
    expect(result.path).toBe('/tmp/login_suite')
    expect(mockWriteFileSync).toHaveBeenCalledTimes(2)
  })

  it('sets file permissions on non-windows platforms', async () => {
    mockShowSaveDialog.mockResolvedValue({ canceled: false, filePath: '/tmp/login_suite' })
    mockExistsSync.mockReturnValue(true)
    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', { value: 'darwin' })
    await exportSuite('suite-1')
    expect(mockChmodSync).toHaveBeenCalledTimes(2)
    Object.defineProperty(process, 'platform', { value: originalPlatform })
  })

  it('returns error when writeFileSync throws', async () => {
    mockShowSaveDialog.mockResolvedValue({ canceled: false, filePath: '/tmp/login_suite' })
    mockExistsSync.mockReturnValue(true)
    mockWriteFileSync.mockImplementation(() => {
      throw new Error('Disk full')
    })
    const result = await exportSuite('suite-1')
    expect(result.success).toBe(false)
    expect(result.error).toContain('Disk full')
  })

  it('calls showSaveDialog with sanitized suite name as default path', async () => {
    mockShowSaveDialog.mockResolvedValue({ canceled: true, filePath: undefined })
    await exportSuite('suite-1')
    expect(mockShowSaveDialog).toHaveBeenCalledWith(
      fakeWindow,
      expect.objectContaining({
        defaultPath: 'login_suite'
      })
    )
  })
})
