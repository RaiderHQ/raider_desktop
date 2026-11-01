import { constants } from 'fs'
import { open, readdir, readFile, realpath, stat, unlink } from 'fs/promises'
import type { FileHandle } from 'fs/promises'
import { join, sep } from 'path'
import yaml from 'js-yaml'
import type {
  LoginsUnsupportedReason,
  SavedLogin,
  SavedLoginsResult
} from '@shared/types/savedLogins'
import { rubyRaiderVersion, supportsLoginReuse } from './rubyRaiderVersion'
import { safeWarn } from '../../utils/safeLog'

// Login files hold live session cookies and storage. Only name, origin, saved_at and
// format ever leave this module, and file contents are never logged.

const LOGIN_FILE = /^[a-z0-9_-]+\.json$/
const LOGIN_NAME = /^[a-z0-9_-]+$/
const DEFAULT_MAX_AGE = 3600
const MAX_LOGIN_BYTES = 10 * 1024 * 1024
// No following a symlinked file, and no blocking on a FIFO
const READ_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
const FORGET_ERROR = 'The saved login could not be removed.'

const isMissing = (error: unknown): boolean => (error as NodeJS.ErrnoException)?.code === 'ENOENT'

/** The project's `.raider/auth` folder, resolved; null when it is missing or leads out of the project */
async function authDirFor(projectPath: string): Promise<string | null> {
  try {
    const project = await realpath(projectPath)
    const authDir = await realpath(join(project, '.raider', 'auth'))
    return authDir.startsWith(project + sep) ? authDir : null
  } catch (error) {
    if (isMissing(error)) return null
    throw error
  }
}

interface ExpiryRules {
  /** null when the gem cannot read login_state.max_age, so it treats every login as stale */
  maxAgeSeconds: number | null
  siteOrigin: string | null
}

const originOf = (url: unknown): string | null => {
  if (typeof url !== 'string') return null
  try {
    const origin = new URL(url).origin
    return origin === 'null' ? null : origin
  } catch {
    return null
  }
}

const DECIMAL_INTEGER = /^\s*[+-]?(0|[1-9]\d*)\s*$/

/**
 * login_state.max_age as the gem's session_state.rb reads it, `Integer(max_age || 3600)`:
 * floats truncate, decimal strings count, and anything else or a non-positive age is null
 */
function maxAgeOf(config: Record<string, unknown>): number | null {
  const loginState = config['login_state']
  if (loginState === undefined || loginState === null) return DEFAULT_MAX_AGE
  if (typeof loginState !== 'object' || Array.isArray(loginState)) return null
  const value = (loginState as Record<string, unknown>)['max_age']
  // Ruby's `||` falls back on nil and false alike
  if (value === undefined || value === null || value === false) return DEFAULT_MAX_AGE
  let seconds: number
  if (typeof value === 'number') seconds = Math.trunc(value)
  else if (typeof value === 'string' && DECIMAL_INTEGER.test(value)) seconds = Number(value)
  else return null
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null
}

async function readExpiryRules(projectPath: string): Promise<ExpiryRules> {
  let config: Record<string, unknown> = {}
  try {
    const parsed = yaml.load(await readFile(join(projectPath, 'config', 'config.yml'), 'utf-8'))
    if (parsed && typeof parsed === 'object') config = parsed as Record<string, unknown>
  } catch {
    // missing or unparseable config: fall back to defaults
  }
  return { maxAgeSeconds: maxAgeOf(config), siteOrigin: originOf(config['url']) }
}

type LoginFields = Pick<SavedLogin, 'origin' | 'savedAt' | 'format'>

/** Picks the three harmless fields out of a login file; the parsed object goes no further */
function pickFields(text: string): LoginFields | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const { origin, saved_at, format } = parsed as Record<string, unknown>
  return {
    origin: typeof origin === 'string' ? origin : null,
    savedAt: typeof saved_at === 'string' ? saved_at : null,
    format: typeof format === 'number' ? format : null
  }
}

function toSavedLogin(
  name: string,
  fields: LoginFields | null,
  rules: ExpiryRules,
  now: Date
): SavedLogin {
  if (!fields) {
    return { name, origin: null, savedAt: null, format: null, known: false, expired: false }
  }
  const login: SavedLogin = { name, ...fields, known: fields.format === 1, expired: false }
  // Like the gem, a login is fresh only while younger than max_age
  const savedAt = fields.savedAt ? Date.parse(fields.savedAt) : NaN
  if (
    rules.maxAgeSeconds === null ||
    Number.isNaN(savedAt) ||
    now.getTime() - savedAt >= rules.maxAgeSeconds * 1000
  ) {
    return { ...login, expired: true, expiredReason: 'age' }
  }
  const origin = originOf(fields.origin)
  if (rules.siteOrigin && origin && origin !== rules.siteOrigin) {
    return { ...login, expired: true, expiredReason: 'site' }
  }
  return login
}

/** The login's fields; null when unreadable as a login (too big or not JSON); undefined to skip it */
async function readLogin(authDir: string, file: string): Promise<LoginFields | null | undefined> {
  let handle: FileHandle | undefined
  try {
    handle = await open(join(authDir, file), READ_FLAGS)
    const stats = await handle.stat()
    if (!stats.isFile()) return undefined
    if (stats.size > MAX_LOGIN_BYTES) return null
    return pickFields(await handle.readFile('utf8'))
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code
    if (code !== 'ENOENT' && code !== 'ELOOP') safeWarn(`Could not read saved login ${file}`)
    return undefined
  } finally {
    await handle?.close().catch(() => undefined)
  }
}

/**
 * Why this project cannot save logins: 'gem' when Gemfile.lock lists a ruby_raider older than
 * 3.11.0, 'helper' when it lacks the generated helpers/session_state.rb; null when it can, or
 * for a mobile project, which never gets the helper
 */
async function loginsUnsupportedReason(
  projectPath: string,
  mobile: boolean
): Promise<LoginsUnsupportedReason | null> {
  if (mobile) return null
  const lock = await readFile(join(projectPath, 'Gemfile.lock'), 'utf-8').catch(() => '')
  const version = rubyRaiderVersion(lock)
  if (version !== null && !supportsLoginReuse(version)) return 'gem'
  const helper = await stat(join(projectPath, 'helpers', 'session_state.rb')).catch(() => null)
  return helper?.isFile() ? null : 'helper'
}

export async function listSavedLogins(
  projectPath: string,
  now: Date = new Date(),
  { mobile = false }: { mobile?: boolean } = {}
): Promise<SavedLoginsResult> {
  const unsupportedReason = await loginsUnsupportedReason(projectPath, mobile)
  let authDir: string | null
  let files: string[]
  try {
    authDir = await authDirFor(projectPath)
    files = authDir ? await readdir(authDir) : []
  } catch {
    safeWarn('Could not list saved logins')
    return { logins: [], unsupportedReason }
  }
  if (!authDir) return { logins: [], unsupportedReason }

  const rules = await readExpiryRules(projectPath)
  const logins: SavedLogin[] = []
  for (const file of files.filter((f) => LOGIN_FILE.test(f))) {
    const fields = await readLogin(authDir, file)
    if (fields === undefined) continue
    logins.push(toSavedLogin(file.slice(0, -'.json'.length), fields, rules, now))
  }
  logins.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  return { logins, unsupportedReason }
}

export async function forgetSavedLogin(
  projectPath: string,
  name: unknown
): Promise<{ ok: true } | { error: string }> {
  if (typeof name !== 'string' || !LOGIN_NAME.test(name)) return { error: FORGET_ERROR }
  try {
    const project = await realpath(projectPath)
    let authDir: string
    try {
      authDir = await realpath(join(project, '.raider', 'auth'))
    } catch (error) {
      if (isMissing(error)) return { ok: true }
      throw error
    }
    if (!authDir.startsWith(project + sep)) return { error: FORGET_ERROR }
    await unlink(join(authDir, `${name}.json`))
    return { ok: true }
  } catch (error) {
    if (isMissing(error)) return { ok: true }
    safeWarn(`Could not remove saved login ${name}`)
    return { error: FORGET_ERROR }
  }
}
