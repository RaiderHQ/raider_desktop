import { describe, it, expect, vi, beforeEach } from 'vitest'
import { IpcMainInvokeEvent } from 'electron'

const { mockSafeExec, mockExistsSync } = vi.hoisted(() => ({
  mockSafeExec: vi.fn(),
  mockExistsSync: vi.fn(() => true)
}))

vi.mock('../../src/main/utils/safeExec', () => ({
  safeExec: (...args: unknown[]) => mockSafeExec(...args)
}))

vi.mock('fix-path', () => ({
  default: vi.fn()
}))

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  return { ...actual, default: { ...actual, existsSync: mockExistsSync }, existsSync: mockExistsSync }
})

import handler from '../../src/main/handlers/project/scaffoldGenerate'

const mockEvent = {} as IpcMainInvokeEvent

beforeEach(() => {
  vi.clearAllMocks()
})

describe('scaffoldGenerate handler', () => {
  it('builds correct command for generate page', async () => {
    mockSafeExec.mockResolvedValue({
      stdout: 'Created page_objects/pages/login.rb',
      stderr: '',
      exitCode: 0
    })

    const result = await handler(
      mockEvent,
      { operation: 'generate', type: 'page', name: 'login' },
      '/project',
      'ruby'
    )

    expect(result.success).toBe(true)
    expect(result.output).toBe('Created page_objects/pages/login.rb')
    const calledCmd = mockSafeExec.mock.calls[0][0] as string
    expect(calledCmd).toContain('raider g page login')
  })

  it('builds correct command for generate spec', async () => {
    mockSafeExec.mockResolvedValue({
      stdout: 'Created spec/login_page_spec.rb',
      stderr: '',
      exitCode: 0
    })

    await handler(mockEvent, { operation: 'generate', type: 'spec', name: 'login' }, '/project', 'ruby')

    const calledCmd = mockSafeExec.mock.calls[0][0] as string
    expect(calledCmd).toContain('raider g spec login')
  })

  it('includes --uses flag when uses are provided', async () => {
    mockSafeExec.mockResolvedValue({ stdout: 'Created', stderr: '', exitCode: 0 })

    await handler(
      mockEvent,
      { operation: 'generate', type: 'page', name: 'dashboard', uses: ['login', 'cart'] },
      '/project',
      'ruby'
    )

    const calledCmd = mockSafeExec.mock.calls[0][0] as string
    expect(calledCmd).toContain('--uses login,cart')
  })

  it('includes --path flag when path is provided', async () => {
    mockSafeExec.mockResolvedValue({ stdout: 'Created', stderr: '', exitCode: 0 })

    await handler(
      mockEvent,
      { operation: 'generate', type: 'page', name: 'login', path: 'custom/dir' },
      '/project',
      'ruby'
    )

    const calledCmd = mockSafeExec.mock.calls[0][0] as string
    expect(calledCmd).toContain('--path custom/dir')
  })

  it('builds correct command for smart scaffold with crud', async () => {
    mockSafeExec.mockResolvedValue({ stdout: 'Generated CRUD', stderr: '', exitCode: 0 })

    await handler(
      mockEvent,
      { operation: 'smart', names: ['user'], crud: true },
      '/project',
      'ruby'
    )

    const calledCmd = mockSafeExec.mock.calls[0][0] as string
    expect(calledCmd).toContain('raider g scaffold user --crud')
  })

  it('builds correct command for smart scaffold with components', async () => {
    mockSafeExec.mockResolvedValue({ stdout: 'Generated', stderr: '', exitCode: 0 })

    await handler(
      mockEvent,
      { operation: 'smart', names: ['login'], components: ['page', 'spec'] },
      '/project',
      'ruby'
    )

    const calledCmd = mockSafeExec.mock.calls[0][0] as string
    expect(calledCmd).toContain('-w page spec')
  })

  it('builds correct command for from_url', async () => {
    mockSafeExec.mockResolvedValue({ stdout: 'Created from URL', stderr: '', exitCode: 0 })

    await handler(
      mockEvent,
      { operation: 'from_url', url: 'https://example.com/login' },
      '/project',
      'ruby'
    )

    const calledCmd = mockSafeExec.mock.calls[0][0] as string
    expect(calledCmd).toContain('raider g from_url https://example.com/login')
  })

  it('builds correct command for from_url with name override', async () => {
    mockSafeExec.mockResolvedValue({ stdout: 'Created from URL', stderr: '', exitCode: 0 })

    await handler(
      mockEvent,
      { operation: 'from_url', url: 'https://example.com/login', name: 'login' },
      '/project',
      'ruby'
    )

    const calledCmd = mockSafeExec.mock.calls[0][0] as string
    expect(calledCmd).toContain('-n login')
  })

  it('builds correct command for dry_run', async () => {
    mockSafeExec.mockResolvedValue({ stdout: 'page_objects/pages/login.rb', stderr: '', exitCode: 0 })

    await handler(
      mockEvent,
      { operation: 'dry_run', type: 'page', name: 'login' },
      '/project',
      'ruby'
    )

    const calledCmd = mockSafeExec.mock.calls[0][0] as string
    expect(calledCmd).toContain('raider g page login --dry-run')
  })

  it('builds correct command for delete', async () => {
    mockSafeExec.mockResolvedValue({ stdout: 'Deleted', stderr: '', exitCode: 0 })

    await handler(
      mockEvent,
      { operation: 'delete', type: 'page', name: 'login' },
      '/project',
      'ruby'
    )

    const calledCmd = mockSafeExec.mock.calls[0][0] as string
    expect(calledCmd).toContain('raider g page login --delete')
  })

  it('wraps command with rbenv init and cd to project path', async () => {
    mockSafeExec.mockResolvedValue({ stdout: 'OK', stderr: '', exitCode: 0 })

    await handler(
      mockEvent,
      { operation: 'generate', type: 'page', name: 'login' },
      '/my/project',
      'ruby'
    )

    const command = mockSafeExec.mock.calls[0][0] as string
    expect(command).toContain('rbenv init')
    expect(command).toContain('cd "/my/project"')
  })

  it('returns failure when exec errors', async () => {
    mockSafeExec.mockResolvedValue({
      stdout: '',
      stderr: 'raider not found',
      exitCode: 1
    })

    const result = await handler(
      mockEvent,
      { operation: 'generate', type: 'page', name: 'login' },
      '/project',
      'ruby'
    )

    expect(result.success).toBe(false)
    expect(result.output).toBe('raider not found')
  })

  it('returns error for generate without type', async () => {
    const result = await handler(
      mockEvent,
      { operation: 'generate', name: 'login' } as any,
      '/project',
      'ruby'
    )

    expect(result.success).toBe(false)
    expect(result.error).toContain('type and name are required')
  })

  it('returns error for from_url without url', async () => {
    const result = await handler(
      mockEvent,
      { operation: 'from_url' } as any,
      '/project',
      'ruby'
    )

    expect(result.success).toBe(false)
    expect(result.error).toContain('url is required')
  })

  it('returns error when project path does not exist', async () => {
    mockExistsSync.mockReturnValueOnce(false)

    const result = await handler(
      mockEvent,
      { operation: 'generate', type: 'page', name: 'login' },
      '/nonexistent/project',
      'ruby'
    )

    expect(result.success).toBe(false)
    expect(result.error).toContain('Project path does not exist')
  })

  it('returns error when --from source file does not exist', async () => {
    // First call: projectPath exists; second call: fromPath does not
    mockExistsSync.mockReturnValueOnce(true).mockReturnValueOnce(false)

    const result = await handler(
      mockEvent,
      { operation: 'generate', type: 'spec', name: 'login', from: 'pages/login_page.rb' },
      '/project',
      'ruby'
    )

    expect(result.success).toBe(false)
    expect(result.error).toContain('Source file not found')
  })

  it('handles multiple names in smart scaffold', async () => {
    mockSafeExec.mockResolvedValue({ stdout: 'Generated', stderr: '', exitCode: 0 })

    await handler(
      mockEvent,
      { operation: 'smart', names: ['login', 'dashboard', 'checkout'] },
      '/project',
      'ruby'
    )

    const calledCmd = mockSafeExec.mock.calls[0][0] as string
    expect(calledCmd).toContain('raider g scaffold login dashboard checkout')
  })
})
