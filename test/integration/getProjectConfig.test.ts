import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockReadFile } = vi.hoisted(() => ({
  mockReadFile: vi.fn()
}))

const { mockYamlLoad } = vi.hoisted(() => ({
  mockYamlLoad: vi.fn()
}))

vi.mock('fs/promises', () => ({
  default: { readFile: mockReadFile },
  readFile: mockReadFile
}))

vi.mock('js-yaml', () => ({
  default: { load: mockYamlLoad }
}))

import handler from '../../src/main/handlers/config/getProjectConfig'

describe('getProjectConfig handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reads url, browser, and headless from config.yml', async () => {
    mockReadFile.mockResolvedValueOnce(
      'url: https://example.com\nbrowser: firefox\nheadless: true\n'
    )
    mockYamlLoad.mockReturnValueOnce({
      url: 'https://example.com',
      browser: 'firefox',
      headless: true
    })

    const result = await handler('/my/project')

    expect(result.success).toBe(true)
    expect(result.config).toEqual({
      baseUrl: 'https://example.com',
      browser: 'firefox',
      headless: true
    })
  })

  it("reads timeout and the current browser's arguments", async () => {
    mockReadFile.mockResolvedValueOnce('')
    mockYamlLoad.mockReturnValueOnce({
      timeout: 10,
      browser: 'chrome',
      browser_arguments: { chrome: ['no-sandbox'], firefox: ['-headless'] }
    })

    const result = await handler('/my/project')

    expect(result.config?.timeout).toBe(10)
    expect(result.config?.browserArguments).toEqual(['no-sandbox'])
  })

  it('omits browserArguments when browser_arguments is missing', async () => {
    mockReadFile.mockResolvedValueOnce('')
    mockYamlLoad.mockReturnValueOnce({ browser: 'chrome', timeout: 5 })

    const result = await handler('/my/project')

    expect(result.success).toBe(true)
    expect(result.config?.browserArguments).toBeUndefined()
  })

  it('omits browserArguments when the browser is absent from browser_arguments', async () => {
    mockReadFile.mockResolvedValueOnce('')
    mockYamlLoad.mockReturnValueOnce({ browser: 'safari', browser_arguments: { chrome: ['x'] } })

    const result = await handler('/my/project')

    expect(result.config?.browserArguments).toBeUndefined()
  })

  it('omits timeout when it is missing', async () => {
    mockReadFile.mockResolvedValueOnce('')
    mockYamlLoad.mockReturnValueOnce({ browser: 'chrome' })

    const result = await handler('/my/project')

    expect(result.config?.timeout).toBeUndefined()
  })

  it('returns an empty config for malformed yml', async () => {
    mockReadFile.mockResolvedValueOnce('{: bad')
    mockYamlLoad.mockImplementationOnce(() => {
      throw new Error('bad yaml')
    })

    const result = await handler('/my/project')

    expect(result).toEqual({ success: true, config: {} })
  })

  it('supports legacy base_url key', async () => {
    mockReadFile.mockResolvedValueOnce('base_url: https://example.com\n')
    mockYamlLoad.mockReturnValueOnce({ base_url: 'https://example.com' })

    const result = await handler('/my/project')

    expect(result.success).toBe(true)
    expect(result.config?.baseUrl).toBe('https://example.com')
  })

  it('returns empty config when config.yml is missing', async () => {
    mockReadFile.mockRejectedValueOnce(new Error('ENOENT'))

    const result = await handler('/my/project')

    expect(result.success).toBe(true)
    expect(result.config).toEqual({})
  })

  it('returns partial config when only some keys exist', async () => {
    mockReadFile.mockResolvedValueOnce('browser: chrome\n')
    mockYamlLoad.mockReturnValueOnce({ browser: 'chrome' })

    const result = await handler('/my/project')

    expect(result.success).toBe(true)
    expect(result.config?.browser).toBe('chrome')
    expect(result.config?.headless).toBeUndefined()
    expect(result.config?.baseUrl).toBeUndefined()
  })

  it('returns error for empty project path', async () => {
    const result = await handler('')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Invalid project path')
  })
})
