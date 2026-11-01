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
  return { ...actual, readFile, default: { ...actual, readFile } }
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
    expect(await listSavedLogins(project, NOW)).toEqual({ logins: [], gemSupportsLogins: false })
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
      expired: false
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

    await seedConfig('login_state:\n  max_age: -5\n')
    const invalid = (await listSavedLogins(project, NOW)).logins
    expect(invalid.map((l) => l.expired)).toEqual([false, true])
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

  it('uses base_url when url is missing, and ignores an unparseable config url', async () => {
    await seed('there.json', login('there', { origin: 'https://other.test' }))

    await seedConfig("base_url: 'https://site.test'\n")
    expect((await listSavedLogins(project, NOW)).logins[0].expiredReason).toBe('site')

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

  it('reports whether the locked ruby_raider supports logins', async () => {
    await writeFile(join(project, 'Gemfile.lock'), 'GEM\n  specs:\n    ruby_raider (3.11.0)\n')
    expect((await listSavedLogins(project, NOW)).gemSupportsLogins).toBe(true)

    await writeFile(join(project, 'Gemfile.lock'), 'GEM\n  specs:\n    ruby_raider (3.10.2)\n')
    expect((await listSavedLogins(project, NOW)).gemSupportsLogins).toBe(false)
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
