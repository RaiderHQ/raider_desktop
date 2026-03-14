import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockWriteFile = vi.fn()
const mockAccess = vi.fn()

vi.mock('electron', () => ({
  IpcMainInvokeEvent: {}
}))

vi.mock('fs/promises', () => ({
  default: {
    writeFile: (...args: unknown[]) => mockWriteFile(...args),
    access: (...args: unknown[]) => mockAccess(...args)
  },
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  access: (...args: unknown[]) => mockAccess(...args)
}))

vi.mock('fs', () => ({
  default: { constants: { F_OK: 0 } },
  constants: { F_OK: 0 }
}))

vi.mock('../../src/main/utils/validatePath', () => ({
  validateFilePath: vi.fn((filePath: string) => ({ valid: true, resolved: filePath }))
}))

import editFile from '../../src/main/handlers/io/editFile'
import { validateFilePath } from '../../src/main/utils/validatePath'

const mockValidateFilePath = validateFilePath as ReturnType<typeof vi.fn>

const fakeEvent = {} as any

describe('editFile handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockValidateFilePath.mockReturnValue({ valid: true, resolved: '/tmp/test.rb' })
    mockAccess.mockResolvedValue(undefined)
    mockWriteFile.mockResolvedValue(undefined)
  })

  it('writes content to file successfully', async () => {
    const result = await editFile(fakeEvent, '/tmp/test.rb', 'new content')
    expect(result.success).toBe(true)
    expect(mockWriteFile).toHaveBeenCalledWith('/tmp/test.rb', 'new content', 'utf-8')
  })

  it('returns error when content is not a string', async () => {
    const result = await editFile(fakeEvent, '/tmp/test.rb', 123 as any)
    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid content')
  })

  it('returns error when file path validation fails', async () => {
    mockValidateFilePath.mockReturnValue({ valid: false, resolved: '' })
    const result = await editFile(fakeEvent, '../../../etc/passwd', 'hack')
    expect(result.success).toBe(false)
    expect(result.error).toContain('Access denied')
  })

  it('returns error when file does not exist (ENOENT)', async () => {
    mockAccess.mockRejectedValue(new Error('ENOENT: no such file or directory'))
    const result = await editFile(fakeEvent, '/tmp/nonexistent.rb', 'content')
    expect(result.success).toBe(false)
    expect(result.error).toContain('File does not exist')
  })

  it('returns permission denied error on EACCES', async () => {
    mockWriteFile.mockRejectedValue(new Error('EACCES: permission denied'))
    const result = await editFile(fakeEvent, '/tmp/test.rb', 'content')
    expect(result.success).toBe(false)
    expect(result.error).toBe('permission.denied.save')
  })

  it('returns generic error message for unknown errors', async () => {
    mockWriteFile.mockRejectedValue('string error')
    const result = await editFile(fakeEvent, '/tmp/test.rb', 'content')
    expect(result.success).toBe(false)
    expect(result.error).toBe('Unknown error')
  })

  it('checks file existence before writing', async () => {
    await editFile(fakeEvent, '/tmp/test.rb', 'content')
    expect(mockAccess).toHaveBeenCalled()
    expect(mockWriteFile).toHaveBeenCalled()
  })

  it('does not write when access check fails', async () => {
    mockAccess.mockRejectedValue(new Error('ENOENT'))
    await editFile(fakeEvent, '/tmp/test.rb', 'content')
    expect(mockWriteFile).not.toHaveBeenCalled()
  })

  it('uses the resolved path from validateFilePath', async () => {
    mockValidateFilePath.mockReturnValue({ valid: true, resolved: '/resolved/path/test.rb' })
    await editFile(fakeEvent, '/some/path/test.rb', 'content')
    expect(mockAccess).toHaveBeenCalledWith('/resolved/path/test.rb', expect.anything())
    expect(mockWriteFile).toHaveBeenCalledWith('/resolved/path/test.rb', 'content', 'utf-8')
  })
})
