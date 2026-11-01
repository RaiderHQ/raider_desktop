// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const failRead = vi.hoisted(() => ({ file: null as string | null }))
vi.mock('fs/promises', async (importActual) => {
  const actual = await importActual<typeof import('fs/promises')>()
  const readFile = ((...args: Parameters<typeof actual.readFile>) => {
    if (failRead.file && String(args[0]).endsWith(failRead.file)) {
      return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))
    }
    return actual.readFile(...args)
  }) as typeof actual.readFile
  const open = ((...args: Parameters<typeof actual.open>) => {
    if (failRead.file && String(args[0]).endsWith(failRead.file)) {
      return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))
    }
    return actual.open(...args)
  }) as typeof actual.open
  return { ...actual, readFile, open, default: { ...actual, readFile, open } }
})
const safeLogMock = vi.hoisted(() => ({ safeLog: vi.fn(), safeError: vi.fn(), safeWarn: vi.fn() }))
vi.mock('../../../src/main/utils/safeLog', () => safeLogMock)

import { mkdtemp, mkdir, writeFile, rm, symlink, readdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { listSavedLogins, forgetSavedLogin } from '../../../src/main/handlers/logins/savedLogins'

const NOW = new Date('2026-11-01T12:00:00Z')

const login = (name: string, overrides: Record<string, unknown> = {}): string =>
  JSON.stringify({
    format: 1,
    name,
    origin: 'https://site.test',
    saved_at: '2026-11-01T11:30:00Z',
    cookies: [{ name: 'session', value: 'SECRET-COOKIE', domain: 'site.test' }],
    local_storage: { token: 'SECRET-STORAGE' },
    session_storage: { other: 'SECRET-STORAGE' },
    ...overrides
  })

describe('saved logins', () => {
  let project: string
  let outside: string
  const authDir = (): string => join(project, '.raider', 'auth')
  const seed = async (file: string, text: string): Promise<void> => {
    await mkdir(authDir(), { recursive: true })
    await writeFile(join(authDir(), file), text)
  }
  const seedConfig = async (text: string): Promise<void> => {
    await mkdir(join(project, 'config'), { recursive: true })
    await writeFile(join(project, 'config', 'config.yml'), text)
  }
  const consoleCalls: unknown[][] = []
  const loggedText = (): string =>
    JSON.stringify([
      ...consoleCalls,
      ...safeLogMock.safeLog.mock.calls,
      ...safeLogMock.safeError.mock.calls,
      ...safeLogMock.safeWarn.mock.calls
    ])

  beforeEach(async () => {
    project = await mkdtemp(join(tmpdir(), 'saved-logins-'))
    outside = await mkdtemp(join(tmpdir(), 'saved-logins-outside-'))
    failRead.file = null
    consoleCalls.length = 0
    vi.clearAllMocks()
    for (const level of ['log', 'error', 'warn'] as const) {
      vi.spyOn(console, level).mockImplementation((...args) => {
        consoleCalls.push(args)
      })
    }
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await rm(project, { recursive: true, force: true })
    await rm(outside, { recursive: true, force: true })
  })

  it('lists only the four fields, never secret values', async () => {
    await seed('admin.json', login('admin'))
    await seed('broken.json', '{"cookies": SECRET-COOKIE')

    const result = await listSavedLogins(project, NOW)

    expect(result.logins.map((l) => l.name)).toEqual(['admin', 'broken'])
    expect(result.logins[0]).toEqual({
      name: 'admin',
      origin: 'https://site.test',
      savedAt: '2026-11-01T11:30:00Z',
      format: 1,
      known: true,
      expired: false
    })
    expect(JSON.stringify(result)).not.toContain('SECRET')
    expect(loggedText()).not.toContain('SECRET')
  })

  it('names a login by its file, not by the name inside it', async () => {
    await seed('admin.json', login('../../evil'))
    const result = await listSavedLogins(project, NOW)
    expect(result.logins.map((l) => l.name)).toEqual(['admin'])
  })

  it('lists nothing when there is no .raider/auth folder', async () => {
    expect(await listSavedLogins(project, NOW)).toEqual({ logins: [], unsupportedReason: 'helper' })
  })

  it('ignores names outside ^[a-z0-9_-]+\\.json$, .lock files and tmp files', async () => {
    await seed('admin.json', login('admin'))
    await seed('admin.lock', '')
    await seed('Admin.json', login('Admin'))
    await seed('a.json.tmp', login('a'))
    await seed('a.lock', '')
    await seed('.x.json', login('x'))

    const result = await listSavedLogins(project, NOW)

    expect(result.logins.map((l) => l.name)).toEqual(['admin'])
  })

  it('skips symlinked files and folders', async () => {
    await seed('admin.json', login('admin'))
    await writeFile(join(outside, 'other.json'), login('other'))
    await symlink(join(outside, 'other.json'), join(authDir(), 'linked.json'))
    await mkdir(join(authDir(), 'folder.json'))

    const result = await listSavedLogins(project, NOW)

    expect(result.logins.map((l) => l.name)).toEqual(['admin'])
    expect(safeLogMock.safeWarn).not.toHaveBeenCalled()
  })

  it('lists a file over 10 MB as unknown without reading it, and it can still be forgotten', async () => {
    await seed('admin.json', login('admin'))
    await seed('big.json', login('big', { padding: 'x'.repeat(10 * 1024 * 1024) }))

    const result = await listSavedLogins(project, NOW)

    expect(result.logins).toEqual([
      expect.objectContaining({ name: 'admin', known: true }),
      { name: 'big', origin: null, savedAt: null, format: null, known: false, expired: false }
    ])
    expect(await forgetSavedLogin(project, 'big')).toEqual({ ok: true })
    expect(await readdir(authDir())).toEqual(['admin.json'])
  })

  it('lists nothing when .raider/auth is a symlink out of the project', async () => {
    await writeFile(join(outside, 'admin.json'), login('admin'))
    await mkdir(join(project, '.raider'), { recursive: true })
    await symlink(outside, authDir())

    const result = await listSavedLogins(project, NOW)

    expect(result.logins).toEqual([])
  })

  it('marks format !== 1 and unparseable files as unknown', async () => {
    await seed('future.json', login('future', { format: 2 }))
    await seed('garbled.json', 'SECRET-COOKIE not json')
    await seed('array.json', '[1, 2]')

    const result = await listSavedLogins(project, NOW)

    expect(result.logins).toEqual([
      { name: 'array', origin: null, savedAt: null, format: null, known: false, expired: false },
      {
        name: 'future',
        origin: 'https://site.test',
        savedAt: '2026-11-01T11:30:00Z',
        format: 2,
        known: false,
        expired: false
      },
      { name: 'garbled', origin: null, savedAt: null, format: null, known: false, expired: false }
    ])
    expect(loggedText()).not.toContain('SECRET')
  })

  it('drops non-string origin and saved_at values', async () => {
    await seed('odd.json', login('odd', { origin: { v: 'x' }, saved_at: 5, format: '1' }))

    const [odd] = (await listSavedLogins(project, NOW)).logins

    expect(odd).toEqual({
      name: 'odd',
      origin: null,
      savedAt: null,
      format: null,
      known: false,
      expired: true,
      expiredReason: 'age'
    })
  })

  it('expires by age using login_state.max_age, default 3600', async () => {
    await seed('fresh.json', login('fresh', { saved_at: '2026-11-01T11:30:00Z' }))
    await seed('stale.json', login('stale', { saved_at: '2026-11-01T10:59:00Z' }))

    const byDefault = (await listSavedLogins(project, NOW)).logins
    expect(byDefault.map((l) => [l.name, l.expired, l.expiredReason])).toEqual([
      ['fresh', false, undefined],
      ['stale', true, 'age']
    ])

    await seedConfig('login_state:\n  max_age: 600\n')
    const shorter = (await listSavedLogins(project, NOW)).logins
    expect(shorter.map((l) => [l.name, l.expired, l.expiredReason])).toEqual([
      ['fresh', true, 'age'],
      ['stale', true, 'age']
    ])

  })

  it('expires a login saved exactly max_age ago, as the gem does', async () => {
    await seed('edge.json', login('edge', { saved_at: '2026-11-01T11:00:00Z' }))
    expect((await listSavedLogins(project, NOW)).logins[0].expiredReason).toBe('age')
  })

  it.each([
    ['missing', { saved_at: undefined }],
    ['unparseable', { saved_at: 'not a date' }]
  ])('expires a login whose saved_at is %s', async (_label, overrides) => {
    await seed('admin.json', login('admin', overrides))
    const [admin] = (await listSavedLogins(project, NOW)).logins
    expect([admin.expired, admin.expiredReason]).toEqual([true, 'age'])
  })

  // fresh.json is 30 minutes old, held.json 90 minutes: each row is [config, fresh expired, held expired]
  it.each([
    ['no login_state', '', false, true],
    ['login_state: null', 'login_state:\n', false, true],
    ['max_age: null', 'login_state:\n  max_age:\n', false, true],
    ['max_age: false', 'login_state:\n  max_age: false\n', false, true],
    ['an integer', 'login_state:\n  max_age: 7200\n', false, false],
    ['a float, truncated', 'login_state:\n  max_age: 5400.9\n', false, true],
    ['a decimal string', "login_state:\n  max_age: '7200'\n", false, false],
    ['a signed, padded string', "login_state:\n  max_age: ' +7200 '\n", false, false],
    ['a non-numeric string', "login_state:\n  max_age: 'soon'\n", true, true],
    ['a hex string', "login_state:\n  max_age: '0x1C20'\n", true, true],
    ['true', 'login_state:\n  max_age: true\n', true, true],
    ['an array', 'login_state:\n  max_age: [7200]\n', true, true],
    ['zero', 'login_state:\n  max_age: 0\n', true, true],
    ['negative', 'login_state:\n  max_age: -5\n', true, true],
    ['a negative string', "login_state:\n  max_age: '-5'\n", true, true],
    ['login_state not a mapping', 'login_state: 7200\n', true, true]
  ])('max_age as %s', async (_label, config, freshExpired, heldExpired) => {
    await seed('fresh.json', login('fresh', { saved_at: '2026-11-01T11:30:00Z' }))
    await seed('held.json', login('held', { saved_at: '2026-11-01T10:30:00Z' }))
    await seedConfig(config)

    const logins = (await listSavedLogins(project, NOW)).logins

    expect(logins.map((l) => [l.name, l.expired])).toEqual([
      ['fresh', freshExpired],
      ['held', heldExpired]
    ])
  })

  it('expires by site when origin differs from config url', async () => {
    await seed('here.json', login('here', { origin: 'https://site.test' }))
    await seed('there.json', login('there', { origin: 'https://other.test' }))
    await seed(
      'old.json',
      login('old', { origin: 'https://other.test', saved_at: '2026-01-01T00:00:00Z' })
    )
    await seed('weird.json', login('weird', { origin: 'not a url' }))
    await seedConfig("url: 'https://site.test/login?x=1'\n")

    const result = await listSavedLogins(project, NOW)

    expect(result.logins.map((l) => [l.name, l.expired, l.expiredReason])).toEqual([
      ['here', false, undefined],
      ['old', true, 'age'],
      ['there', true, 'site'],
      ['weird', false, undefined]
    ])
  })

  it('checks the site against url only, never base_url', async () => {
    await seed('there.json', login('there', { origin: 'https://other.test' }))

    await seedConfig("base_url: 'https://site.test'\n")
    expect((await listSavedLogins(project, NOW)).logins[0].expired).toBe(false)

    await seedConfig("url: 'garbage'\n")
    expect((await listSavedLogins(project, NOW)).logins[0].expired).toBe(false)
  })

  it('skips a file that disappears between readdir and read', async () => {
    await seed('admin.json', login('admin'))
    await seed('gone.json', login('gone'))
    failRead.file = 'gone.json'

    const result = await listSavedLogins(project, NOW)

    expect(result.logins.map((l) => l.name)).toEqual(['admin'])
  })

  describe('unsupported reason', () => {
    const lock = (version: string): Promise<void> =>
      writeFile(join(project, 'Gemfile.lock'), `GEM\n  specs:\n    ruby_raider (${version})\n`)
    const addHelper = async (): Promise<void> => {
      await mkdir(join(project, 'helpers'), { recursive: true })
      await writeFile(join(project, 'helpers', 'session_state.rb'), 'class SessionState; end\n')
    }
    const reason = async (options?: { mobile?: boolean }): Promise<string | null> =>
      (await listSavedLogins(project, NOW, options)).unsupportedReason

    it("is 'gem' when Gemfile.lock lists ruby_raider older than 3.11.0, helper or not", async () => {
      await lock('3.10.2')
      expect(await reason()).toBe('gem')
      await addHelper()
      expect(await reason()).toBe('gem')
    })

    it("is 'helper' when helpers/session_state.rb is missing, whatever the gem", async () => {
      await lock('3.11.0')
      expect(await reason()).toBe('helper')

      await rm(join(project, 'Gemfile.lock'))
      expect(await reason()).toBe('helper')

      await writeFile(join(project, 'Gemfile.lock'), 'GEM\n  specs:\n    rspec (3.13.0)\n')
      expect(await reason()).toBe('helper')

      await mkdir(join(project, 'helpers', 'session_state.rb'), { recursive: true })
      expect(await reason()).toBe('helper')
    })

    it('is null with the helper and a 3.11 or unknown gem', async () => {
      await addHelper()
      expect(await reason()).toBeNull()

      await lock('3.11.0')
      expect(await reason()).toBeNull()

      await rm(join(project, 'Gemfile.lock'))
      await mkdir(join(project, 'Gemfile.lock'))
      expect(await reason()).toBeNull()
    })

    it('is null for a mobile project, which never gets the helper', async () => {
      await lock('3.10.2')
      expect(await reason({ mobile: true })).toBeNull()
    })
  })

  it('forget deletes only <name>.json and keeps <name>.lock', async () => {
    await seed('admin.json', login('admin'))
    await seed('admin.lock', '')
    await seed('other.json', login('other'))

    expect(await forgetSavedLogin(project, 'admin')).toEqual({ ok: true })

    expect((await readdir(authDir())).sort()).toEqual(['admin.lock', 'other.json'])
  })

  it('forget of a missing file is ok', async () => {
    expect(await forgetSavedLogin(project, 'admin')).toEqual({ ok: true })
    await seed('other.json', login('other'))
    expect(await forgetSavedLogin(project, 'admin')).toEqual({ ok: true })
  })

  it.each(['../x', 'A', 'a/b', '', 5])('forget rejects %s', async (name) => {
    await seed('a.json', login('a'))
    await mkdir(join(authDir(), 'a'), { recursive: true })
    await writeFile(join(authDir(), 'a', 'b.json'), login('b'))
    await writeFile(join(project, '.raider', 'x.json'), login('x'))

    expect(await forgetSavedLogin(project, name)).toEqual({
      error: 'The saved login could not be removed.'
    })

    expect((await readdir(authDir())).sort()).toEqual(['a', 'a.json'])
    expect(await readdir(join(authDir(), 'a'))).toEqual(['b.json'])
    expect(await readdir(join(project, '.raider'))).toContain('x.json')
  })

  it('forget refuses when .raider/auth is a symlink out of the project', async () => {
    await writeFile(join(outside, 'admin.json'), login('admin'))
    await mkdir(join(project, '.raider'), { recursive: true })
    await symlink(outside, authDir())

    expect(await forgetSavedLogin(project, 'admin')).toEqual({
      error: 'The saved login could not be removed.'
    })
    expect(await readdir(outside)).toEqual(['admin.json'])
  })
})
