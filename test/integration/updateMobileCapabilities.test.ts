import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn(),
    writeFile: vi.fn()
  }
}))

import fs from 'fs/promises'
import handler from '../../src/main/handlers/config/updateMobileCapabilities'

const mockReadFile = vi.mocked(fs.readFile)
const mockWriteFile = vi.mocked(fs.writeFile)

const validCapabilities = {
  platformVersion: '16.0',
  automationName: 'XCUITest',
  deviceName: 'iPhone 14',
  app: '/path/to/app.ipa'
}

const sampleYaml = `browserName: ''
appium:options:
  url: http://127.0.0.1:4723
  platformVersion: '15.0'
  automationName: UiAutomator2
  deviceName: Pixel 5
  app: /old/path/app.apk
`

const fakeEvent = {} as any

describe('updateMobileCapabilities handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('successfully updates mobile capabilities in a valid YAML file', async () => {
    mockReadFile.mockResolvedValue(sampleYaml)
    mockWriteFile.mockResolvedValue(undefined)

    const result = await handler(fakeEvent, '/my/project', validCapabilities)

    expect(result.success).toBe(true)
    expect(result.output).toBe('Mobile capabilities updated successfully.')
    expect(mockReadFile).toHaveBeenCalledWith(
      expect.stringContaining('config/capabilities.yml'),
      'utf8'
    )
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining('config/capabilities.yml'),
      expect.any(String),
      'utf8'
    )
  })

  it('preserves the existing url field', async () => {
    mockReadFile.mockResolvedValue(sampleYaml)
    mockWriteFile.mockResolvedValue(undefined)

    await handler(fakeEvent, '/my/project', validCapabilities)

    const writtenContent = mockWriteFile.mock.calls[0][1] as string
    expect(writtenContent).toContain('url: http://127.0.0.1:4723')
  })

  it('writes the new capability values', async () => {
    mockReadFile.mockResolvedValue(sampleYaml)
    mockWriteFile.mockResolvedValue(undefined)

    await handler(fakeEvent, '/my/project', validCapabilities)

    const writtenContent = mockWriteFile.mock.calls[0][1] as string
    expect(writtenContent).toContain("platformVersion: '16.0'")
    expect(writtenContent).toContain("automationName: 'XCUITest'")
    expect(writtenContent).toContain("deviceName: 'iPhone 14'")
    expect(writtenContent).toContain("app: '/path/to/app.ipa'")
  })

  it('returns error for empty project path', async () => {
    const result = await handler(fakeEvent, '', validCapabilities)

    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid projectPath')
  })

  it('returns error for whitespace-only project path', async () => {
    const result = await handler(fakeEvent, '   ', validCapabilities)

    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid projectPath')
  })

  it('returns error for non-string project path', async () => {
    const result = await handler(fakeEvent, 123 as unknown as string, validCapabilities)

    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid projectPath')
  })

  it('returns error for null capabilities', async () => {
    const result = await handler(fakeEvent, '/my/project', null as any)

    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid capabilities')
  })

  it('returns error for non-object capabilities', async () => {
    const result = await handler(fakeEvent, '/my/project', 'bad' as any)

    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid capabilities')
  })

  it('returns error for empty platformVersion', async () => {
    const result = await handler(fakeEvent, '/my/project', {
      ...validCapabilities,
      platformVersion: ''
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid platformVersion')
  })

  it('returns error for empty automationName', async () => {
    const result = await handler(fakeEvent, '/my/project', {
      ...validCapabilities,
      automationName: ''
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid automationName')
  })

  it('returns error for empty deviceName', async () => {
    const result = await handler(fakeEvent, '/my/project', {
      ...validCapabilities,
      deviceName: ''
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid deviceName')
  })

  it('returns error for empty app', async () => {
    const result = await handler(fakeEvent, '/my/project', {
      ...validCapabilities,
      app: ''
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid app')
  })

  it('returns error when config file does not exist (ENOENT)', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT: no such file or directory'))

    const result = await handler(fakeEvent, '/nonexistent/project', validCapabilities)

    expect(result.success).toBe(false)
    expect(result.error).toContain('ENOENT')
  })

  it('returns error when appium:options block is missing', async () => {
    mockReadFile.mockResolvedValue('browserName: chrome\nsome_other_key: value\n')

    const result = await handler(fakeEvent, '/my/project', validCapabilities)

    expect(result.success).toBe(false)
    expect(result.error).toContain('appium:options block not found')
  })

  it('returns error on file write failure', async () => {
    mockReadFile.mockResolvedValue(sampleYaml)
    mockWriteFile.mockRejectedValue(new Error('Permission denied'))

    const result = await handler(fakeEvent, '/my/project', validCapabilities)

    expect(result.success).toBe(false)
    expect(result.error).toContain('Permission denied')
  })

  it('handles appium:options block without url field', async () => {
    const yamlNoUrl = `browserName: ''
appium:options:
  platformVersion: '15.0'
  automationName: UiAutomator2
  deviceName: Pixel 5
  app: /old/path/app.apk
`
    mockReadFile.mockResolvedValue(yamlNoUrl)
    mockWriteFile.mockResolvedValue(undefined)

    const result = await handler(fakeEvent, '/my/project', validCapabilities)

    expect(result.success).toBe(true)
    const writtenContent = mockWriteFile.mock.calls[0][1] as string
    expect(writtenContent).not.toContain('url:')
  })

  it('returns error for non-string capability fields', async () => {
    const result = await handler(fakeEvent, '/my/project', {
      ...validCapabilities,
      deviceName: 42 as unknown as string
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid deviceName')
  })
})
