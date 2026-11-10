import { constants, promises as fs } from 'node:fs'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { assertRealInside, resolveInside, serialize } from '../tests/sidecar'
import type { FlowEnvError, FlowEnvKeys } from '../../../shared/types/flows'

// The flow secrets file, .raider/flows/env, as the gem's flows/support/run.rb loads it: KEY=value
// lines, `#` comment lines, the raw value stripped and one pair of surrounding quotes removed, no
// escapes or interpolation, at most 64 KB, only from a regular file you own with mode 600.
// Values come in from the renderer but never go back out: answers carry keys and error codes only,
// and nothing here logs.

const ENV_DIRS = ['.raider', '.raider/flows'] as const
const ENV_FILE = '.raider/flows/env'
const MAX_BYTES = 64 * 1024
const MAX_KEY = 100
const MAX_VALUE = 2000
const SETTABLE_KEY = /^(RAIDER_SECRET_[A-Z0-9_]+|TEST_USER|TEST_PASSWORD)$/
// eslint-disable-next-line no-control-regex -- control characters are exactly what it refuses
const CONTROL = /[\u0000-\u001f\u007f]/
// The gem's ENV_KEY; it ignores RAIDER_FLOW_* keys (the run wrapper's own)
const GEM_KEY = /^[A-Z_][A-Z0-9_]*$/
const NEWLINE = 0x0a

type Code = FlowEnvError['error']

class FlowEnvFailure extends Error {
  constructor(readonly code: Code) {
    super(code)
  }
}

const fail = (code: Code): never => {
  throw new FlowEnvFailure(code)
}

const errno = (error: unknown): string | undefined => (error as NodeJS.ErrnoException)?.code

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype

const hasExactly = (payload: Record<string, unknown>, keys: string[]): boolean => {
  const own = Object.keys(payload)
  return own.length === keys.length && keys.every((key) => own.includes(key))
}

const isSettableKey = (key: unknown): key is string =>
  typeof key === 'string' && key.length <= MAX_KEY && SETTABLE_KEY.test(key)

const isValue = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length >= 1 &&
  value.length <= MAX_VALUE &&
  !CONTROL.test(value)

/** `{ key, value }` with nothing else, or null */
export function parseSetPayload(payload: unknown): { key: string; value: string } | null {
  if (!isPlainObject(payload) || !hasExactly(payload, ['key', 'value'])) return null
  const { key, value } = payload
  return isSettableKey(key) && isValue(value) ? { key, value } : null
}

/** `{ key }` with nothing else, or null */
export function parseRemovePayload(payload: unknown): { key: string } | null {
  if (!isPlainObject(payload) || !hasExactly(payload, ['key'])) return null
  return isSettableKey(payload.key) ? { key: payload.key } : null
}

/**
 * The line's value as the gem reads it back exactly: raw when stripping and unquoting leave it
 * alone, else wrapped in one pair of quotes it doesn't contain. Null when it holds both kinds.
 */
export function envValue(value: string): string | null {
  const needsQuotes = /["'#]/.test(value) || /^\s|\s$/.test(value)
  if (!needsQuotes) return value
  if (!value.includes('"')) return `"${value}"`
  if (!value.includes("'")) return `'${value}'`
  return null
}

const utf8 = new TextDecoder('utf-8', { fatal: true })

/** The key the gem would set from this line, or null (comment, blank, junk, RAIDER_FLOW_*) */
function keyOf(line: Buffer): string | null {
  let text: string
  try {
    text = utf8.decode(line).trim()
  } catch {
    return null
  }
  if (text === '' || text.startsWith('#')) return null
  const eq = text.indexOf('=')
  if (eq < 0) return null
  const key = text.slice(0, eq).trim()
  return GEM_KEY.test(key) && !key.startsWith('RAIDER_FLOW_') ? key : null
}

/** The file's lines without their `\n`; the last one is empty when the file ends with `\n` */
function splitLines(content: Buffer): Buffer[] {
  const lines: Buffer[] = []
  let start = 0
  for (let at = content.indexOf(NEWLINE); at >= 0; at = content.indexOf(NEWLINE, start)) {
    lines.push(content.subarray(start, at))
    start = at + 1
  }
  lines.push(content.subarray(start))
  return lines
}

const joinLines = (lines: Buffer[]): Buffer =>
  Buffer.concat(lines.flatMap((line, i) => (i === 0 ? [line] : [Buffer.from('\n'), line])))

const keysOf = (lines: Buffer[]): string[] => [
  ...new Set(lines.map(keyOf).filter((key): key is string => key !== null))
]

/** The env file's path once it and its folders are known to stay inside the project */
async function envPath(projectPath: string): Promise<string> {
  try {
    const file = resolveInside(projectPath, ENV_FILE)
    await assertRealInside(projectPath, file)
    return file
  } catch (error) {
    if (error instanceof FlowEnvFailure) throw error
    return fail(errno(error) && errno(error) !== 'ENOENT' ? 'io' : 'unsafe')
  }
}

/**
 * Checks .raider and .raider/flows are real folders (not links). Missing ones are created 0700
 * when `create`, else answered with false. An existing .raider keeps its mode.
 */
async function ensureDirs(projectPath: string, create: boolean): Promise<boolean> {
  for (const rel of ENV_DIRS) {
    const dir = path.join(projectPath, rel)
    let stat = await fs.lstat(dir).catch((error) => (errno(error) === 'ENOENT' ? null : fail('io')))
    if (!stat) {
      if (!create) return false
      let created = true
      await fs.mkdir(dir, { mode: 0o700 }).catch((error) => {
        if (errno(error) !== 'EEXIST') fail('io')
        created = false
      })
      stat = await fs.lstat(dir).catch(() => fail('io'))
      if (created && stat.isDirectory() && rel === '.raider/flows')
        await fs.chmod(dir, 0o700).catch(() => fail('io'))
    }
    if (!stat.isDirectory()) fail('unsafe')
  }
  return true
}

/** The env file's bytes (never following a link), or null when there is none */
async function readEnv(file: string): Promise<Buffer | null> {
  const flags = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
  const handle = await fs.open(file, flags).catch((error) => {
    if (errno(error) === 'ENOENT') return null
    return fail(errno(error) === 'ELOOP' ? 'unsafe' : 'io')
  })
  if (!handle) return null
  try {
    const stat = await handle.stat().catch(() => fail('io'))
    if (!stat.isFile()) fail('unsafe')
    if (stat.size > MAX_BYTES) fail('too-large')
    const buffer = Buffer.alloc(MAX_BYTES + 1)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0).catch(() => fail('io'))
    if (bytesRead > MAX_BYTES) fail('too-large')
    return buffer.subarray(0, bytesRead)
  } finally {
    await handle.close().catch(() => undefined)
  }
}

/** Replaces `file` with `body` via a fresh 0600 temp file in the same folder (fsynced, renamed) */
async function writePrivate(file: string, body: Buffer): Promise<void> {
  const tmp = path.join(
    path.dirname(file),
    `.env.${process.pid}.${randomBytes(4).toString('hex')}.tmp`
  )
  try {
    const handle = await fs.open(tmp, 'wx', 0o600)
    try {
      await handle.writeFile(body)
      // The umask may have narrowed it further; the gem wants exactly 600
      await handle.chmod(0o600)
      await handle.sync()
    } finally {
      await handle.close()
    }
    await fs.rename(tmp, file)
  } catch {
    await fs.unlink(tmp).catch(() => undefined)
    fail('io')
  }
}

async function guarded(task: () => Promise<FlowEnvKeys>): Promise<FlowEnvKeys | FlowEnvError> {
  try {
    return await task()
  } catch (error) {
    return { error: error instanceof FlowEnvFailure ? error.code : 'io' }
  }
}

// One rewrite at a time per project, so two quick saves don't lose one
const queues = new Map<string, Promise<unknown>>()

/** The env file's keys in file order, de-duplicated; never values */
export function listFlowEnvKeys(projectPath: string): Promise<FlowEnvKeys | FlowEnvError> {
  return guarded(async () => {
    const file = await envPath(projectPath)
    if (!(await ensureDirs(projectPath, false))) return { keys: [] }
    const content = await readEnv(file)
    return { keys: content ? keysOf(splitLines(content)) : [] }
  })
}

/** Sets `key` in place (dropping later lines of the same key), or appends it */
export function setFlowEnv(
  projectPath: string,
  key: string,
  value: string
): Promise<FlowEnvKeys | FlowEnvError> {
  return serialize(queues, projectPath, () =>
    guarded(async () => {
      const line = envValue(value)
      if (line === null) fail('value-unsupported')
      const entry = Buffer.from(`${key}=${line}`, 'utf8')
      const file = await envPath(projectPath)
      await ensureDirs(projectPath, true)
      const lines = splitLines((await readEnv(file)) ?? Buffer.alloc(0))
      let replaced = false
      const next = lines.flatMap((current) => {
        if (keyOf(current) !== key) return [current]
        if (replaced) return []
        replaced = true
        return [entry]
      })
      if (!replaced) {
        // Before the final empty piece (a trailing newline), else after the last line
        if (next[next.length - 1].length === 0) next.splice(next.length - 1, 0, entry)
        else next.push(entry, Buffer.alloc(0))
      }
      const body = joinLines(next)
      // The gem reads only the first 64 KB: a bigger file would lose its tail
      if (body.length > MAX_BYTES) fail('too-large')
      await writePrivate(file, body)
      return { keys: keysOf(next) }
    })
  )
}

/** Drops every line of `key`; a missing file stays missing */
export function removeFlowEnv(
  projectPath: string,
  key: string
): Promise<FlowEnvKeys | FlowEnvError> {
  return serialize(queues, projectPath, () =>
    guarded(async () => {
      const file = await envPath(projectPath)
      if (!(await ensureDirs(projectPath, false))) return { keys: [] }
      const content = await readEnv(file)
      if (!content) return { keys: [] }
      const lines = splitLines(content)
      const next = lines.filter((line) => keyOf(line) !== key)
      if (next.length !== lines.length) await writePrivate(file, joinLines(next))
      return { keys: keysOf(next) }
    })
  )
}
