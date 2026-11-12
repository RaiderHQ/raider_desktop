import { execFile, type ExecFileException, type ExecFileOptions } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { safeExec } from '../../utils/safeExec'
import { buildShellCommand } from '../../utils/shellCommand'
import { cleanPath } from '../../utils/cleanPath'
import { ensureUtf8Locale } from '../../utils/locale'
import { safeWarn } from '../../utils/safeLog'
import { isValidRubyCommand } from '../../utils/rubyCommand'

// `raider …` gem commands. The renderer's rubyCommand is a shell prefix (rbenv / rvm), so it is
// used once, in a constant command, to find the absolute ruby; every gem call then runs that
// ruby with an argv array, never through a shell, so nothing from a payload (names, schedule
// values) is ever parsed by one.

const RESOLVE_TIMEOUT_MS = 20_000
const CLI_TIMEOUT_MS = 60_000
const MAX_STDOUT = 1024 * 1024
const MAX_MESSAGE = 500
/** What a caller gets of stderr: its tail, enough for a backtrace's first lines */
const MAX_STDERR = 16 * 1024
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const LINE_BREAK_OR_NUL = /[\n\r\u0000]/

export type ExecFileFn = (
  file: string,
  args: string[],
  options: ExecFileOptions,
  callback: (error: ExecFileException | null, stdout: string, stderr: string) => void
) => unknown

export interface RubyResolverDeps {
  exec: typeof safeExec
  stat: (file: string) => Promise<{ isFile(): boolean }>
}

/** The absolute ruby a valid rubyCommand selects in a project, or null. */
export type RubyResolver = (projectPath: string, rubyCommand: string) => Promise<string | null>

export interface GemCliDeps {
  execFile: ExecFileFn
  resolveRuby: RubyResolver
}

export type GemCliResult =
  /** stderr: a successful command's warnings and notices (bounded), for the caller to pick from */
  | { ok: true; stdout: string; stderr: string; json?: unknown }
  | {
      ok: false
      error: 'gem-output' | 'timeout' | 'ruby' | 'refused'
      message?: string
      exitCode?: number
      /** A refusal's whole stderr (bounded), to tell a gem that can't load from a refusal */
      stderr?: string
    }

/**
 * A resolver with its own cache of answers (failures are not cached, so fixing rbenv
 * works without a restart). Keyed by project too: a plain `ruby` follows the project's
 * .ruby-version, so the same command can pick different rubies in different projects.
 */
export function makeRubyResolver(deps: RubyResolverDeps): RubyResolver {
  const cache = new Map<string, string>()
  return async (projectPath, rubyCommand) => {
    if (!isValidRubyCommand(rubyCommand)) return null
    const key = `${projectPath}\u0000${rubyCommand}`
    const cached = cache.get(key)
    if (cached) return cached
    const command = buildShellCommand(projectPath, `${rubyCommand} -e 'print RbConfig.ruby'`)
    const { stdout, exitCode } = await deps.exec(command, { timeout: RESOLVE_TIMEOUT_MS })
    if (exitCode !== 0 || !path.isAbsolute(stdout) || LINE_BREAK_OR_NUL.test(stdout)) return null
    const stat = await deps.stat(stdout).catch(() => null)
    if (!stat?.isFile()) return null
    cache.set(key, stdout)
    return stdout
  }
}

const defaultDeps: GemCliDeps = {
  execFile: (file, args, options, callback) =>
    execFile(file, args, { ...options, encoding: 'utf8' }, callback),
  resolveRuby: makeRubyResolver({ exec: safeExec, stat: (file) => fs.stat(file) })
}

/**
 * The environment of a gem call: the app's own, with the selected ruby's folder first on
 * PATH and no node_modules/.bin. GEM_HOME / GEM_PATH stay (the gem copies them into the OS
 * schedule entry); BUNDLE_GEMFILE goes (the project's Gemfile is found from cwd).
 */
export function gemEnv(absRuby: string, base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base }
  delete env.BUNDLE_GEMFILE
  const rest = cleanPath(base.PATH)
  env.PATH = rest ? `${path.dirname(absRuby)}${path.delimiter}${rest}` : path.dirname(absRuby)
  return ensureUtf8Locale(env)
}

/** The last non-empty stderr line, without control characters, at most 500 chars. */
function refusalMessage(stderr: string): string {
  const lines = stderr.split(/\r?\n/).map((line) => line.replace(CONTROL_CHARS, '').trim())
  return (lines.filter(Boolean).pop() ?? '').slice(0, MAX_MESSAGE)
}

/**
 * Runs `raider <args…> --project <projectPath>` with the project's bundle. Only the command
 * name (args[0]) is ever logged: the other arguments may hold payload values.
 */
export async function runGemCli(
  projectPath: string,
  rubyCommand: string,
  args: string[],
  opts: { json?: boolean } = {},
  deps: GemCliDeps = defaultDeps
): Promise<GemCliResult> {
  const command = args[0] ?? ''
  const absRuby = await deps.resolveRuby(projectPath, rubyCommand)
  if (!absRuby) return { ok: false, error: 'ruby' }

  const argv = ['-S', 'bundle', 'exec', 'raider', ...args, '--project', projectPath]
  const options: ExecFileOptions = {
    cwd: projectPath,
    env: gemEnv(absRuby),
    timeout: CLI_TIMEOUT_MS,
    maxBuffer: MAX_STDOUT,
    windowsHide: true
  }
  const { error, stdout, stderr } = await new Promise<{
    error: ExecFileException | null
    stdout: string
    stderr: string
  }>((resolve) => {
    deps.execFile(absRuby, argv, options, (error, stdout, stderr) =>
      resolve({ error, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') })
    )
  })

  if (error) {
    // Never error.message: Node puts the whole command line (with every argument) in it
    if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
      safeWarn(`raider ${command}: output too large`)
      return { ok: false, error: 'gem-output' }
    }
    if (error.killed || error.signal) {
      safeWarn(`raider ${command}: timed out`)
      return { ok: false, error: 'timeout' }
    }
    if (typeof error.code !== 'number') {
      safeWarn(`raider ${command}: could not start ruby (${String(error.code)})`)
      return { ok: false, error: 'ruby' }
    }
    const message = refusalMessage(stderr)
    safeWarn(`raider ${command} exited ${error.code}: ${message}`)
    return {
      ok: false,
      error: 'refused',
      message,
      exitCode: error.code,
      stderr: stderr.slice(-MAX_STDERR)
    }
  }

  if (stderr.trim()) safeWarn(`raider ${command} stderr: ${refusalMessage(stderr)}`)
  const errText = stderr.slice(-MAX_STDERR)
  if (!opts.json) return { ok: true, stdout, stderr: errText }
  try {
    return { ok: true, stdout, stderr: errText, json: JSON.parse(stdout.trim()) }
  } catch {
    safeWarn(`raider ${command}: output is not JSON`)
    return { ok: false, error: 'gem-output' }
  }
}
