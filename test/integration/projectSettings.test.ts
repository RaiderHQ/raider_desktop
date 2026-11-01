import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import yaml from 'js-yaml'

const failRead = vi.hoisted(() => ({ code: null as string | null }))
vi.mock('fs/promises', async (importActual) => {
  const actual = await importActual<typeof import('fs/promises')>()
  const readFile = ((...args: Parameters<typeof actual.readFile>) => {
    if (failRead.code) {
      return Promise.reject(Object.assign(new Error(failRead.code), { code: failRead.code }))
    }
    return actual.readFile(...args)
  }) as typeof actual.readFile
  return { ...actual, readFile, default: { ...actual, readFile } }
})
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  normalizePriority,
  readRecorderSettings,
  writeRecorderSettings
} from '../../src/main/handlers/config/projectSettings'

const FIXTURE = `browser: chrome
url: 'https://raider-test-site.onrender.com/'
timeout: 10 # seconds — used for implicit waits and max wait time
viewport:
  width: 1920
  height: 1080
`

describe('normalizePriority', () => {
  const DEFAULT = ['role', 'label', 'testId', 'text', 'id', 'css', 'xpath']

  it('gives the new default for a missing or old-default list', () => {
    expect(normalizePriority(undefined)).toEqual(DEFAULT)
    expect(normalizePriority([])).toEqual(DEFAULT)
    expect(normalizePriority(['id', 'data-testid', 'css', 'xpath'])).toEqual(DEFAULT)
  })

  it('maps data-testid to testId and keeps known and custom names', () => {
    expect(normalizePriority(['label', 'data-testid', 'data-qa', 'css'])).toEqual([
      'label',
      'testId',
      'data-qa',
      'css'
    ])
  })
})

describe('projectSettings', () => {
  let dir: string
  const configPath = (): string => join(dir, 'config', 'config.yml')
  const seed = async (text: string): Promise<void> => {
    await mkdir(join(dir, 'config'), { recursive: true })
    await writeFile(configPath(), text)
  }

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'project-settings-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('reads defaults when file is missing', async () => {
    expect(await readRecorderSettings(dir)).toEqual({
      baseUrl: '',
      browser: 'chrome',
      headless: false,
      implicitWait: 0,
      explicitWait: 10,
      selectorPriority: ['role', 'label', 'testId', 'text', 'id', 'css', 'xpath'],
      testIdAttribute: 'data-testid'
    })
  })

  it('explicitWait falls back to timeout', async () => {
    await seed(FIXTURE.replace('timeout: 10', 'timeout: 15'))
    expect((await readRecorderSettings(dir)).explicitWait).toBe(15)
  })

  it('reads url, browser, new keys', async () => {
    await seed(
      `url: https://example.com\nbrowser: firefox\nheadless: true\nimplicit_wait: 3\nexplicit_wait: 7\nselector_priority: [css, id]\n`
    )
    expect(await readRecorderSettings(dir)).toEqual({
      baseUrl: 'https://example.com',
      browser: 'firefox',
      headless: true,
      implicitWait: 3,
      explicitWait: 7,
      selectorPriority: ['css', 'id'],
      testIdAttribute: 'data-testid'
    })
  })

  it('reads test_id_attribute', async () => {
    await seed(`test_id_attribute: data-qa\n`)
    expect((await readRecorderSettings(dir)).testIdAttribute).toBe('data-qa')
  })

  it('ignores an unusable test_id_attribute', async () => {
    await seed(`test_id_attribute: 'not valid!'\n`)
    expect((await readRecorderSettings(dir)).testIdAttribute).toBe('data-testid')
  })

  it('reads the old default selector_priority as the new default', async () => {
    await seed(`selector_priority: [id, data-testid, css, xpath]\n`)
    expect((await readRecorderSettings(dir)).selectorPriority).toEqual([
      'role',
      'label',
      'testId',
      'text',
      'id',
      'css',
      'xpath'
    ])
  })

  it('maps data-testid and keeps a custom attribute in selector_priority', async () => {
    await seed(`selector_priority: [data-testid, data-cy, text, xpath]\n`)
    expect((await readRecorderSettings(dir)).selectorPriority).toEqual([
      'testId',
      'data-cy',
      'text',
      'xpath'
    ])
  })

  it('replaces existing key in place', async () => {
    const original = `${FIXTURE}explicit_wait: 5 # keep me\nother: 1\n`
    await seed(original)
    await writeRecorderSettings(dir, { explicitWait: 20 })
    expect(await readFile(configPath(), 'utf-8')).toBe(
      original.replace('explicit_wait: 5', 'explicit_wait: 20')
    )
  })

  it('appends missing key', async () => {
    await seed(FIXTURE)
    await writeRecorderSettings(dir, { implicitWait: 2 })
    const text = await readFile(configPath(), 'utf-8')
    expect(text).toBe(`${FIXTURE}implicit_wait: 2\n`)
    expect(text).toContain('timeout: 10 # seconds — used for implicit waits and max wait time\n')
  })

  it('appends on a new line when file has no trailing newline', async () => {
    await seed('browser: chrome')
    await writeRecorderSettings(dir, { implicitWait: 1 })
    expect(await readFile(configPath(), 'utf-8')).toBe('browser: chrome\nimplicit_wait: 1\n')
  })

  it('writes selector_priority in flow style', async () => {
    await seed(FIXTURE)
    await writeRecorderSettings(dir, { selectorPriority: ['id', 'data-testid', 'css', 'xpath'] })
    expect(await readFile(configPath(), 'utf-8')).toContain(
      'selector_priority: [id, data-testid, css, xpath]\n'
    )
  })

  it('creates config.yml with only the written keys when missing', async () => {
    await writeRecorderSettings(dir, { implicitWait: 1, explicitWait: 4 })
    expect(await readFile(configPath(), 'utf-8')).toBe('implicit_wait: 1\nexplicit_wait: 4\n')
  })

  it('replaces a block-style selector_priority without leaving stray lines', async () => {
    await seed(`${FIXTURE}selector_priority:\n  - id\n  - css\nafter: 1\n`)
    await writeRecorderSettings(dir, { selectorPriority: ['xpath', 'id'] })
    const text = await readFile(configPath(), 'utf-8')
    expect(text).toBe(`${FIXTURE}selector_priority: [xpath, id]\nafter: 1\n`)
    expect(yaml.load(text)).toMatchObject({ selector_priority: ['xpath', 'id'], after: 1 })
  })

  it('replaces a multi-line flow selector_priority', async () => {
    await seed(`selector_priority: [id,\n  css]\nafter: 1\n`)
    await writeRecorderSettings(dir, { selectorPriority: ['css'] })
    expect(await readFile(configPath(), 'utf-8')).toBe('selector_priority: [css]\nafter: 1\n')
  })

  it('rejects and leaves config untouched on a non-ENOENT read error', async () => {
    await seed(FIXTURE)
    failRead.code = 'EACCES'
    try {
      await expect(writeRecorderSettings(dir, { implicitWait: 2 })).rejects.toThrow('EACCES')
    } finally {
      failRead.code = null
    }
    expect(await readFile(configPath(), 'utf-8')).toBe(FIXTURE)
  })
})
