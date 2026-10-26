import path from 'path'
import { safeExec } from '../../utils/safeExec'
import type { SafeExecResult } from '../../utils/safeExec'
import { buildShellCommand } from '../../utils/shellCommand'
import { isValidRubyCommand } from '../../utils/rubyCommand'

// Single quotes keep spaces and shell characters in a spec path literal
const shellQuote = (value: string): string => `'${value.replace(/'/g, `'\\''`)}'`

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

/**
 * What a project spec run tells the renderer. Any non-zero exit is a failed
 * run: rspec prints load errors and failing examples to stdout, so stderr may
 * be empty. stdout is passed on as is so the dashboard can still read rspec's
 * JSON; stderr, when there is some, is added so the user sees why it failed.
 */
export function toRunResult(result: SafeExecResult): { success: boolean; output: string } {
  if (result.exitCode === 0) return { success: true, output: result.stdout }
  if (!result.stderr) return { success: false, output: result.stdout }
  return {
    success: false,
    output: `Test execution failed.\n\n--- STDERR ---\n${result.stderr}\n\n--- STDOUT ---\n${result.stdout}`
  }
}
