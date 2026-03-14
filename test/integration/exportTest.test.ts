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
    writeFileSync: vi.fn(),
    chmodSync: vi.fn()
  },
  writeFileSync: vi.fn(),
  chmodSync: vi.fn()
}))

vi.mock('../../src/main/handlers/appState', () => ({
  appState: {
    projectFramework: 'rspec',
    projectAutomation: 'selenium'
  }
}))

vi.mock('../../src/main/handlers/frameworkTemplates', () => ({
  generateExportContent: vi.fn(() => '# generated test content'),
  getExportExtension: vi.fn(() => 'rb'),
  getExportFilters: vi.fn(() => [{ name: 'Ruby', extensions: ['rb'] }])
}))

import { BrowserWindow, dialog } from 'electron'
import fs from 'fs'
import exportTest from '../../src/main/handlers/io/exportTest'

const mockGetFocusedWindow = BrowserWindow.getFocusedWindow as ReturnType<typeof vi.fn>
const mockShowSaveDialog = dialog.showSaveDialog as ReturnType<typeof vi.fn>
const mockWriteFileSync = fs.writeFileSync as ReturnType<typeof vi.fn>
const mockChmodSync = fs.chmodSync as ReturnType<typeof vi.fn>

describe('exportTest handler', () => {
  const testData = {
    testName: 'Login Test',
    steps: ['@driver.get("http://example.com")', '@driver.find_element(:id, "btn").click']
  }

  const fakeWindow = { id: 1 }

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetFocusedWindow.mockReturnValue(fakeWindow)
  })

  it('returns error when no focused window is available', async () => {
    mockGetFocusedWindow.mockReturnValue(null)
    const result = await exportTest(testData as any)
    expect(result.success).toBe(false)
    expect(result.error).toContain('No focused window')
  })

  it('returns error when user cancels the save dialog', async () => {
    mockShowSaveDialog.mockResolvedValue({ canceled: true, filePath: undefined })
    const result = await exportTest(testData as any)
    expect(result.success).toBe(false)
    expect(result.error).toContain('cancelled')
  })

  it('returns error when filePath is empty', async () => {
    mockShowSaveDialog.mockResolvedValue({ canceled: false, filePath: '' })
    const result = await exportTest(testData as any)
    expect(result.success).toBe(false)
  })

  it('exports test successfully and writes file', async () => {
    mockShowSaveDialog.mockResolvedValue({ canceled: false, filePath: '/tmp/login_test.rb' })
    const result = await exportTest(testData as any)
    expect(result.success).toBe(true)
    expect(result.path).toBe('/tmp/login_test.rb')
    expect(mockWriteFileSync).toHaveBeenCalledWith('/tmp/login_test.rb', '# generated test content', 'utf8')
  })

  it('sets file permissions on non-windows platforms', async () => {
    mockShowSaveDialog.mockResolvedValue({ canceled: false, filePath: '/tmp/login_test.rb' })
    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', { value: 'darwin' })
    await exportTest(testData as any)
    expect(mockChmodSync).toHaveBeenCalledWith('/tmp/login_test.rb', '755')
    Object.defineProperty(process, 'platform', { value: originalPlatform })
  })

  it('returns error when writeFileSync throws', async () => {
    mockShowSaveDialog.mockResolvedValue({ canceled: false, filePath: '/tmp/login_test.rb' })
    mockWriteFileSync.mockImplementation(() => {
      throw new Error('EACCES: permission denied')
    })
    const result = await exportTest(testData as any)
    expect(result.success).toBe(false)
    expect(result.error).toContain('EACCES')
  })

  it('calls showSaveDialog with correct default filename', async () => {
    mockShowSaveDialog.mockResolvedValue({ canceled: true, filePath: undefined })
    await exportTest(testData as any)
    expect(mockShowSaveDialog).toHaveBeenCalledWith(
      fakeWindow,
      expect.objectContaining({
        defaultPath: 'login_test.rb',
        title: 'Export Test Script'
      })
    )
  })
})
