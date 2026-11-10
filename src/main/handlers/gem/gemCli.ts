import { execFile, type ExecFileException, type ExecFileOptions } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { safeExec } from '../../utils/safeExec'
import { buildShellCommand } from '../../utils/shellCommand'
import { cleanPath } from '../../utils/cleanPath'
import { ensureUtf8Locale } from '../../utils/locale'
import { safeWarn } from '../../utils/safeLog'
import { isValidRubyCommand } from '../../utils/rubyCommand'

// `raider flow …` (ruby_raider 4.1+) for the Flows tab. The renderer's rubyCommand is a shell
// prefix (rbenv / rvm), so it is used once, in a constant command, to find the absolute ruby;
// every gem call then runs that ruby with an argv array, never through a shell, so nothing
// from a payload (flow names, schedule inputs) is ever parsed by one.

const RESOLVE_TIMEOUT_MS = 20_000
const CLI_TIMEOUT_MS = 60_000
const MAX_STDOUT = 1024 * 1024
const MAX_MESSAGE = 500
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

export interface FlowCliDeps {
  execFile: ExecFileFn
  resolveRuby: RubyResolver
}

export type FlowCliResult =
  | { ok: true; stdout: string; json?: unknown }
  | {
      ok: false
      error: 'gem-output' | 'timeout' | 'ruby' | 'refused'
      message?: string
      exitCode?: number
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

const defaultDeps: FlowCliDeps = {
  execFile: (file, args, options, callback) =>
    execFile(file, args, { ...options, encoding: 'utf8' }, callback),
  resolveRuby: makeRubyResolver({ exec: safeExec, stat: (file) => fs.stat(file) })
}

/**
 * The environment of a gem call: the app's own, with the selected ruby's folder first on
 * PATH and no node_modules/.bin. GEM_HOME / GEM_PATH stay (the gem copies them into the OS
 * schedule entry); BUNDLE_GEMFILE goes (the project's Gemfile is found from cwd), and so do
 * inherited RAIDER_FLOW_* / RAIDER_INPUT_* values that would leak into a run.
 */
export function flowEnv(absRuby: string, base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base }
  for (const key of Object.keys(env)) {
    if (key.startsWith('RAIDER_FLOW_') || key.startsWith('RAIDER_INPUT_')) delete env[key]
  }
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
 * Runs `raider flow <args…> --project <projectPath>` with the project's bundle. Only the
 * command name (args[0]) is ever logged: the other arguments may hold schedule inputs.
 */
export async function runFlowCli(
  projectPath: string,
  rubyCommand: string,
  args: string[],
  opts: { json?: boolean } = {},
  deps: FlowCliDeps = defaultDeps
): Promise<FlowCliResult> {
  const command = args[0] ?? ''
  const absRuby = await deps.resolveRuby(projectPath, rubyCommand)
  if (!absRuby) return { ok: false, error: 'ruby' }

  const argv = ['-S', 'bundle', 'exec', 'raider', 'flow', ...args, '--project', projectPath]
  const options: ExecFileOptions = {
    cwd: projectPath,
    env: flowEnv(absRuby),
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
    // Never error.message: Node puts the whole command line (with the inputs) in it
    if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
      safeWarn(`raider flow ${command}: output too large`)
      return { ok: false, error: 'gem-output' }
    }
    if (error.killed || error.signal) {
      safeWarn(`raider flow ${command}: timed out`)
      return { ok: false, error: 'timeout' }
    }
    if (typeof error.code !== 'number') {
      safeWarn(`raider flow ${command}: could not start ruby (${String(error.code)})`)
      return { ok: false, error: 'ruby' }
    }
    const message = refusalMessage(stderr)
    safeWarn(`raider flow ${command} exited ${error.code}: ${message}`)
    return { ok: false, error: 'refused', message, exitCode: error.code }
  }

  if (stderr.trim()) safeWarn(`raider flow ${command} stderr: ${refusalMessage(stderr)}`)
  if (!opts.json) return { ok: true, stdout }
  try {
    return { ok: true, stdout, json: JSON.parse(stdout.trim()) }
  } catch {
    safeWarn(`raider flow ${command}: output is not JSON`)
    return { ok: false, error: 'gem-output' }
  }
}
