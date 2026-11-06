import { describe, it, expect, afterEach } from 'vitest'
import { ensureUtf8Locale, applyUtf8Locale } from '../../src/main/utils/locale'
import { safeExec } from '../../src/main/utils/safeExec'

const LOCALE_VARS = ['LC_ALL', 'LC_CTYPE', 'LANG'] as const

describe('ensureUtf8Locale', () => {
  it('adds a UTF-8 LANG and LC_ALL when no locale variable is set', () => {
    const env = ensureUtf8Locale({ PATH: '/usr/bin' })
    expect(env.LANG).toBe('en_US.UTF-8')
    expect(env.LC_ALL).toBe('en_US.UTF-8')
    expect(env.PATH).toBe('/usr/bin')
  })

  it('leaves the environment alone when a locale already names UTF-8', () => {
    for (const name of LOCALE_VARS) {
      const env = ensureUtf8Locale({ [name]: 'fr_FR.UTF-8' })
      expect(env).toEqual({ [name]: 'fr_FR.UTF-8' })
    }
    expect(ensureUtf8Locale({ LANG: 'C.utf8' })).toEqual({ LANG: 'C.utf8' })
  })

  it('treats the C and POSIX locales as missing', () => {
    expect(ensureUtf8Locale({ LANG: 'C' }).LC_ALL).toBe('en_US.UTF-8')
    expect(ensureUtf8Locale({ LC_ALL: 'POSIX' }).LC_ALL).toBe('en_US.UTF-8')
  })

  it('does not mutate the object it is given', () => {
    const input = { PATH: '/usr/bin' }
    ensureUtf8Locale(input)
    expect(input).toEqual({ PATH: '/usr/bin' })
  })
})

describe('applyUtf8Locale', () => {
  const saved = LOCALE_VARS.map((name) => [name, process.env[name]] as const)

  afterEach(() => {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  })

  it('repairs process.env in place, so spawned children inherit a UTF-8 locale', () => {
    for (const name of LOCALE_VARS) delete process.env[name]
    applyUtf8Locale()
    expect(process.env.LANG).toBe('en_US.UTF-8')
  })
})

describe('safeExec locale', () => {
  it.skipIf(process.platform === 'win32')(
    'gives the shell a UTF-8 LANG even when the app was launched without one',
    async () => {
      const env = { ...process.env }
      for (const name of LOCALE_VARS) delete env[name]
      const result = await safeExec('printf %s "$LANG"', { env, timeout: 5000 })
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toBe('en_US.UTF-8')
    }
  )
})
