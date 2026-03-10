import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'fs'

vi.mock('electron', () => ({ app: { getPath: vi.fn() } }))

import handler from '../../src/main/handlers/isMobileProject'

describe('isMobileProject handler (integration)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns isMobileProject=true when capabilities.yml exists', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)
    const result = await handler({} as any, '/fake/project')
    expect(result.success).toBe(true)
    expect(result.isMobileProject).toBe(true)
  })

  it('returns isMobileProject=false when capabilities.yml does not exist', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false)
    const result = await handler({} as any, '/fake/project')
    expect(result.success).toBe(true)
    expect(result.isMobileProject).toBe(false)
  })

  it('checks the correct path: <projectFolder>/config/capabilities.yml', async () => {
    const spy = vi.spyOn(fs, 'existsSync').mockReturnValue(false)
    await handler({} as any, '/my/project')
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('capabilities.yml'))
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('my/project'))
  })

  it('returns error on thrown exception', async () => {
    vi.spyOn(fs, 'existsSync').mockImplementation(() => {
      throw new Error('disk error')
    })
    const result = await handler({} as any, '/bad/path')
    expect(result.success).toBe(false)
    expect(result.error).toContain('disk error')
  })
})
