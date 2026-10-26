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

  it('builds correct command for scaffold type', async () => {
    mockSafeExec.mockResolvedValue({ stdout: 'Generated', stderr: '', exitCode: 0 })

    await handler(mockEvent, { operation: 'generate', type: 'scaffold', name: 'login' }, '/project', 'ruby')

    const calledCmd = mockSafeExec.mock.calls[0][0] as string
    expect(calledCmd).toContain('raider g scaffold login')
  })

  it('builds raider g page login --path pages', async () => {
    mockSafeExec.mockResolvedValue({ stdout: 'Created', stderr: '', exitCode: 0 })

    await handler(
      mockEvent,
      { operation: 'generate', type: 'page', name: 'login', path: 'pages' },
      '/project',
      'ruby'
    )

    const calledCmd = mockSafeExec.mock.calls[0][0] as string
    expect(calledCmd).toContain('raider g page login --path pages')
  })

  it('never emits flags or commands the gem does not accept', async () => {
    mockSafeExec.mockResolvedValue({ stdout: 'Created', stderr: '', exitCode: 0 })

    await handler(
      mockEvent,
      {
        operation: 'delete',
        type: 'spec',
        name: 'login',
        uses: ['a'],
        from: 'x.rb',
        ai: true,
        crud: true
      } as never,
      '/project',
      'ruby'
    )

    const calls = mockSafeExec.mock.calls
    const cmd = (calls[0]?.[0] as string | undefined) ?? ''
    for (const bad of ['--uses', '--from', '--ai', '--delete', '--dry-run', '--crud', 'destroy', 'from_url']) {
      expect(cmd).not.toContain(bad)
    }
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
})
