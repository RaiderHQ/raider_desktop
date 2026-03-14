import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSend = vi.fn()
const mockReload = vi.fn()

vi.mock('electron', () => ({
  dialog: {
    showOpenDialog: vi.fn()
  },
  BrowserWindow: {}
}))

vi.mock('fs', () => ({
  default: {
    readdirSync: vi.fn(),
    readFileSync: vi.fn()
  },
  readdirSync: vi.fn(),
  readFileSync: vi.fn()
}))

vi.mock('crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('crypto')>()
  return {
    ...actual,
    randomUUID: vi.fn(() => 'mock-uuid-1234')
  }
})

vi.mock('../../src/main/handlers/appState', () => ({
  appState: {
    suites: new Map(),
    mainWindow: {
      webContents: {
        send: (...args: unknown[]) => mockSend(...args)
      },
      reload: () => mockReload()
    }
  }
}))

import { dialog } from 'electron'
import * as fs from 'fs'
import importProject from '../../src/main/handlers/io/importProject'
import { appState } from '../../src/main/handlers/appState'

const mockShowOpenDialog = dialog.showOpenDialog as ReturnType<typeof vi.fn>
const mockReaddirSync = fs.readdirSync as ReturnType<typeof vi.fn>
const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>

const fakeMainWindow = {
  webContents: { send: mockSend },
  reload: mockReload
} as any

describe('importProject handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    appState.suites = new Map()
  })

  it('returns error when mainWindow is null', async () => {
    const result = await importProject(null as any)
    expect(result.success).toBe(false)
    expect(result.error).toContain('Main window not found')
  })

  it('returns error when user cancels directory selection', async () => {
    mockShowOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
    const result = await importProject(fakeMainWindow)
    expect(result.success).toBe(false)
    expect(result.error).toContain('No directory selected')
  })

  it('returns error when no file paths are returned', async () => {
    mockShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: [] })
    const result = await importProject(fakeMainWindow)
    expect(result.success).toBe(false)
    expect(result.error).toContain('No directory selected')
  })

  it('imports project with subdirectories as suites', async () => {
    mockShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/project'] })

    // Project root: two suite directories
    mockReaddirSync
      .mockReturnValueOnce([
        { name: 'auth_suite', isDirectory: () => true },
        { name: 'dashboard_suite', isDirectory: () => true }
      ])
      // auth_suite files
      .mockReturnValueOnce(['login_test.rb', 'signup_test.rb'])
      // dashboard_suite files
      .mockReturnValueOnce(['load_test.rb'])

    mockReadFileSync
      .mockReturnValueOnce('# Test: Login Test\nbegin\n  step1\n  puts "Test \'Login Test\' passed successfully!"')
      .mockReturnValueOnce('# Test: Signup Test\nbegin\n  step2\n  puts "Test \'Signup Test\' passed successfully!"')
      .mockReturnValueOnce('# no test name comment\nsome content')

    const result = await importProject(fakeMainWindow)
    expect(result.success).toBe(true)
    expect(appState.suites.size).toBe(2)
  })

  it('clears existing suites before importing', async () => {
    appState.suites.set('old-suite', { id: 'old-suite', name: 'Old', tests: [] })

    mockShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/project'] })
    mockReaddirSync.mockReturnValueOnce([]) // no subdirectories

    const result = await importProject(fakeMainWindow)
    expect(result.success).toBe(true)
    expect(appState.suites.size).toBe(0)
  })

  it('extracts test name from comment in file content', async () => {
    mockShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/project'] })
    mockReaddirSync
      .mockReturnValueOnce([{ name: 'suite1', isDirectory: () => true }])
      .mockReturnValueOnce(['test.rb'])
    mockReadFileSync.mockReturnValue('# Test: My Custom Test\nbegin\n  @driver.get("http://x.com")\n  puts "Test \'My Custom Test\' passed successfully!"')

    await importProject(fakeMainWindow)

    const suite = Array.from(appState.suites.values())[0]
    expect(suite.tests[0].name).toBe('My Custom Test')
  })

  it('falls back to filename when no test name comment found', async () => {
    mockShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/project'] })
    mockReaddirSync
      .mockReturnValueOnce([{ name: 'suite1', isDirectory: () => true }])
      .mockReturnValueOnce(['my_test.rb'])
    mockReadFileSync.mockReturnValue('some ruby code without test comment')

    await importProject(fakeMainWindow)

    const suite = Array.from(appState.suites.values())[0]
    expect(suite.tests[0].name).toBe('my_test')
  })

  it('skips non-.rb files', async () => {
    mockShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/project'] })
    mockReaddirSync
      .mockReturnValueOnce([{ name: 'suite1', isDirectory: () => true }])
      .mockReturnValueOnce(['readme.md', 'test.rb', 'config.yml'])
    mockReadFileSync.mockReturnValue('# Test: Test\ncode')

    await importProject(fakeMainWindow)

    const suite = Array.from(appState.suites.values())[0]
    expect(suite.tests).toHaveLength(1)
  })

  it('sends suite-updated event and reloads the window', async () => {
    mockShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/project'] })
    mockReaddirSync.mockReturnValueOnce([])

    await importProject(fakeMainWindow)

    expect(mockSend).toHaveBeenCalledWith('suite-updated', expect.any(Array))
    expect(mockReload).toHaveBeenCalled()
  })

  it('returns error when readdirSync throws', async () => {
    mockShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/project'] })
    mockReaddirSync.mockImplementation(() => {
      throw new Error('Permission denied')
    })

    const result = await importProject(fakeMainWindow)
    expect(result.success).toBe(false)
    expect(result.error).toContain('Permission denied')
  })

  it('parses steps from file content between begin and puts', async () => {
    mockShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/project'] })
    mockReaddirSync
      .mockReturnValueOnce([{ name: 'suite1', isDirectory: () => true }])
      .mockReturnValueOnce(['test.rb'])
    mockReadFileSync.mockReturnValue(
      '# Test: Step Test\nbegin\n  @driver.get("http://x.com")\n  @driver.find_element(:id, "btn").click\n  puts "Test \'Step Test\' passed successfully!"'
    )

    await importProject(fakeMainWindow)

    const suite = Array.from(appState.suites.values())[0]
    expect(suite.tests[0].steps).toEqual([
      '@driver.get("http://x.com")',
      '@driver.find_element(:id, "btn").click'
    ])
  })
})
