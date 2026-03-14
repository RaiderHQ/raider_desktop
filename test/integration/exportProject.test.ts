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
import exportProject from '../../src/main/handlers/io/exportProject'
import { appState } from '../../src/main/handlers/appState'

const mockGetFocusedWindow = BrowserWindow.getFocusedWindow as ReturnType<typeof vi.fn>
const mockShowSaveDialog = dialog.showSaveDialog as ReturnType<typeof vi.fn>
const mockExistsSync = fs.existsSync as ReturnType<typeof vi.fn>
const mockMkdirSync = fs.mkdirSync as ReturnType<typeof vi.fn>
const mockWriteFileSync = fs.writeFileSync as ReturnType<typeof vi.fn>
const mockChmodSync = fs.chmodSync as ReturnType<typeof vi.fn>

const fakeWindow = { id: 1 }

describe('exportProject handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetFocusedWindow.mockReturnValue(fakeWindow)
    appState.suites = new Map()
  })

  it('returns error when no focused window is available', async () => {
    mockGetFocusedWindow.mockReturnValue(null)
    const result = await exportProject()
    expect(result.success).toBe(false)
    expect(result.error).toContain('No focused window')
  })

  it('returns error when user cancels dialog', async () => {
    mockShowSaveDialog.mockResolvedValue({ canceled: true, filePath: undefined })
    const result = await exportProject()
    expect(result.success).toBe(false)
    expect(result.error).toContain('cancelled')
  })

  it('creates project directory if it does not exist', async () => {
    mockShowSaveDialog.mockResolvedValue({ canceled: false, filePath: '/tmp/project' })
    mockExistsSync.mockReturnValue(false)
    await exportProject()
    expect(mockMkdirSync).toHaveBeenCalledWith('/tmp/project')
  })

  it('does not create project directory if it already exists', async () => {
    mockShowSaveDialog.mockResolvedValue({ canceled: false, filePath: '/tmp/project' })
    mockExistsSync.mockReturnValue(true)
    await exportProject()
    expect(mockMkdirSync).not.toHaveBeenCalled()
  })

  it('exports empty project successfully with no suites', async () => {
    mockShowSaveDialog.mockResolvedValue({ canceled: false, filePath: '/tmp/project' })
    mockExistsSync.mockReturnValue(true)
    const result = await exportProject()
    expect(result.success).toBe(true)
    expect(result.path).toBe('/tmp/project')
    expect(mockWriteFileSync).not.toHaveBeenCalled()
  })

  it('creates suite folders and writes test files for each suite', async () => {
    appState.suites.set('suite-1', {
      id: 'suite-1',
      name: 'Auth Suite',
      tests: [
        { id: 'test-1', name: 'Login test', url: '', steps: ['step1'] },
        { id: 'test-2', name: 'Signup test', url: '', steps: ['step2'] }
      ]
    })
    appState.suites.set('suite-2', {
      id: 'suite-2',
      name: 'Dashboard Suite',
      tests: [
        { id: 'test-3', name: 'Load dashboard', url: '', steps: ['step3'] }
      ]
    })

    mockShowSaveDialog.mockResolvedValue({ canceled: false, filePath: '/tmp/project' })
    // First call: project dir exists, then suite dirs don't exist
    mockExistsSync.mockReturnValueOnce(true).mockReturnValueOnce(false).mockReturnValueOnce(false)

    const result = await exportProject()
    expect(result.success).toBe(true)
    expect(result.path).toBe('/tmp/project')
    // 2 suite directories created
    expect(mockMkdirSync).toHaveBeenCalledTimes(2)
    // 3 test files written
    expect(mockWriteFileSync).toHaveBeenCalledTimes(3)
  })

  it('sets file permissions on non-windows platforms', async () => {
    appState.suites.set('suite-1', {
      id: 'suite-1',
      name: 'Suite',
      tests: [{ id: 'test-1', name: 'Test', url: '', steps: [] }]
    })
    mockShowSaveDialog.mockResolvedValue({ canceled: false, filePath: '/tmp/project' })
    mockExistsSync.mockReturnValueOnce(true).mockReturnValueOnce(false)

    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', { value: 'darwin' })
    await exportProject()
    expect(mockChmodSync).toHaveBeenCalledTimes(1)
    Object.defineProperty(process, 'platform', { value: originalPlatform })
  })

  it('returns error when file write throws', async () => {
    appState.suites.set('suite-1', {
      id: 'suite-1',
      name: 'Suite',
      tests: [{ id: 'test-1', name: 'Test', url: '', steps: [] }]
    })
    mockShowSaveDialog.mockResolvedValue({ canceled: false, filePath: '/tmp/project' })
    mockExistsSync.mockReturnValue(true)
    mockWriteFileSync.mockImplementation(() => {
      throw new Error('Write failed')
    })

    const result = await exportProject()
    expect(result.success).toBe(false)
    expect(result.error).toContain('Write failed')
  })

  it('calls showSaveDialog with correct default path', async () => {
    mockShowSaveDialog.mockResolvedValue({ canceled: true, filePath: undefined })
    await exportProject()
    expect(mockShowSaveDialog).toHaveBeenCalledWith(
      fakeWindow,
      expect.objectContaining({
        defaultPath: 'raider-project',
        title: 'Export Project'
      })
    )
  })
})
