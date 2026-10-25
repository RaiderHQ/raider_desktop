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
    projectAutomation: 'selenium',
    recorderSettings: { browser: 'chrome', headless: false, implicitWait: 0, explicitWait: 30 }
  }
}))

vi.mock('../../src/main/codegen/testFile', () => ({
  generateRspecFile: vi.fn(() => '# generated test content'),
  toAutomation: vi.fn(() => 'selenium')
}))

vi.mock('../../src/main/handlers/frameworkTemplates', () => ({
  getExportExtension: vi.fn(() => 'rb'),
  getExportFilters: vi.fn(() => [{ name: 'Ruby', extensions: ['rb'] }])
}))

import { BrowserWindow, dialog } from 'electron'
import fs from 'fs'
import { generateRspecFile } from '../../src/main/codegen/testFile'
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
    const [path, content, encoding] = mockWriteFileSync.mock.calls[0]
    expect([path, encoding]).toEqual(['/tmp/login_test.rb', 'utf8'])
    // Header (name + steps JSON for re-import) followed by the generated spec
    expect(content).toMatch(/^# Test: Login Test\n# raider-steps: \[.*\]\n\n# generated test content$/)
  })

  it('migrates legacy string steps to the step model before generating', async () => {
    mockShowSaveDialog.mockResolvedValue({ canceled: false, filePath: '/tmp/login_test.rb' })
    await exportTest(testData as any)
    const [test, automation, settings] = (generateRspecFile as ReturnType<typeof vi.fn>).mock
      .calls[0]
    expect(test.name).toBe('Login Test')
    expect(test.steps.map((s: { kind: string }) => s.kind)).toEqual(['navigate', 'click'])
    expect(automation).toBe('selenium')
    expect(settings).toMatchObject({ browser: 'chrome', explicitWait: 30 })
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
