import path from 'path'
import { safeExec } from '../../utils/safeExec'
import type { SafeExecResult } from '../../utils/safeExec'
import { buildShellCommand } from '../../utils/shellCommand'

// Single quotes keep spaces and shell characters in a spec path literal
const shellQuote = (value: string): string => `'${value.replace(/'/g, `'\\''`)}'`

// The shapes the app itself produces (see isRubyInstalled): plain `ruby`, a path to a
// ruby binary, or the rbenv preamble pinned to one version. Anything else is refused,
// because the command is spliced into a shell line.
const RUBY_COMMAND = [/^[\w./~@+-]+$/, /^eval "\$\(rbenv init -\)" && rbenv shell [\w.-]+ && ruby$/]

export function isValidRubyCommand(command: unknown): command is string {
  return typeof command === 'string' && RUBY_COMMAND.some((shape) => shape.test(command))
}

/**
 * Runs spec files of a project in one `rspec --format json` call, from the
 * project folder so its own spec helper and config apply. `files` are
 * relative to the project root.
 */
export function runSpecFiles(
  projectPath: string,
  files: string[],
  rubyCommand: string
): Promise<SafeExecResult> {
  if (!isValidRubyCommand(rubyCommand)) {
    return Promise.reject(new Error('The Ruby command is not valid, so the tests were not run.'))
  }
  // node_modules/.bin must not shadow the user's Ruby tools
  const newPath = (process.env.PATH || '')
    .split(path.delimiter)
    .filter((p) => !p.includes(path.join('node_modules', '.bin')))
    .join(path.delimiter)

  const rspec = `${rubyCommand} -S rspec ${files.map(shellQuote).join(' ')} --format json`
  return safeExec(buildShellCommand(projectPath, rspec), {
    cwd: projectPath,
    env: { ...process.env, PATH: newPath },
    timeout: 120_000
  })
}
