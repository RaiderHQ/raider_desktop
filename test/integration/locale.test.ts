import { describe, it, expect, afterEach } from 'vitest'
import { ensureUtf8Locale, applyUtf8Locale } from '../../src/main/utils/locale'
import { safeExec } from '../../src/main/utils/safeExec'

const LOCALE_VARS = ['LC_ALL', 'LC_CTYPE', 'LANG'] as const

describe('ensureUtf8Locale', () => {
  it('adds a UTF-8 LANG when no locale variable is set, and nothing else', () => {
    const env = ensureUtf8Locale({ PATH: '/usr/bin' })
    expect(env).toEqual({ PATH: '/usr/bin', LANG: 'en_US.UTF-8' })
  })

  it('leaves the environment alone when the effective locale names UTF-8', () => {
    for (const name of LOCALE_VARS) {
      const env = ensureUtf8Locale({ [name]: 'fr_FR.UTF-8' })
      expect(env).toEqual({ [name]: 'fr_FR.UTF-8' })
    }
    expect(ensureUtf8Locale({ LANG: 'C.utf8' })).toEqual({ LANG: 'C.utf8' })
    // LC_ALL wins over LANG, so a C LANG under a UTF-8 LC_ALL is fine
    expect(ensureUtf8Locale({ LC_ALL: 'fr_FR.UTF-8', LANG: 'C' })).toEqual({
      LC_ALL: 'fr_FR.UTF-8',
      LANG: 'C'
    })
  })

  it('fixes the character type only, keeping a non-UTF-8 LANG for messages', () => {
    expect(ensureUtf8Locale({ LANG: 'C' })).toEqual({ LANG: 'C', LC_CTYPE: 'en_US.UTF-8' })
    expect(ensureUtf8Locale({ LC_CTYPE: 'POSIX', LANG: 'fr_FR.UTF-8' })).toEqual({
      LC_CTYPE: 'en_US.UTF-8',
      LANG: 'fr_FR.UTF-8'
    })
  })

  it('replaces an LC_ALL that overrides a UTF-8 LANG with C', () => {
    expect(ensureUtf8Locale({ LC_ALL: 'C', LANG: 'en_US.UTF-8' })).toEqual({
      LC_ALL: 'en_US.UTF-8',
      LANG: 'en_US.UTF-8'
    })
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
