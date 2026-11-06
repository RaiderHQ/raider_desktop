import { exec, ExecOptions } from 'child_process'
import { ensureUtf8Locale } from './locale'

/**
 * Default timeout for shell commands (30 seconds).
 * Long-running operations like bundle install should override this.
 */
const DEFAULT_TIMEOUT_MS = 30_000

/**
 * Maximum timeout allowed (5 minutes).
 */
const MAX_TIMEOUT_MS = 300_000

export interface SafeExecResult {
  stdout: string
  stderr: string
  exitCode: number | null
}

export interface SafeExecOptions extends ExecOptions {
  timeout?: number
  /**
   * End the child's stdin at once, so a command that asks a question (Thor's
   * "Overwrite?" prompt) reads end-of-file instead of waiting out the timeout.
   * Off by default: a prompt answered by EOF may take the default answer.
   */
  closeStdin?: boolean
}

/**
 * Wraps child_process.exec with a mandatory timeout to prevent indefinite hangs.
 * All shell command execution in the main process should go through this wrapper.
 * The child always gets a UTF-8 locale (see locale.ts).
 */
export function safeExec(command: string, options: SafeExecOptions = {}): Promise<SafeExecResult> {
  const { closeStdin, ...execOptions } = options
  const timeout = Math.min(options.timeout ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS)
  const env = ensureUtf8Locale(options.env ?? process.env)

  return new Promise((resolve) => {
    const child = exec(
      command,
      { ...execOptions, env, timeout, encoding: 'utf8' },
      (error, stdout, stderr) => {
        if (error && error.killed) {
          resolve({
            stdout: stdout?.toString() ?? '',
            stderr: `Command timed out after ${timeout}ms`,
            exitCode: null
          })
        } else if (error) {
          resolve({
            stdout: stdout?.toString() ?? '',
            stderr: stderr?.toString() ?? error.message,
            exitCode: error.code ?? 1
          })
        } else {
          resolve({
            stdout: stdout?.toString() ?? '',
            stderr: stderr?.toString() ?? '',
            exitCode: 0
          })
        }
      }
    )

    if (closeStdin) child.stdin?.end()

    // Safety net: if the child process hasn't resolved after timeout + 5s, force kill
    const killTimer = setTimeout(() => {
      if (!child.killed) {
        child.kill('SIGKILL')
      }
    }, timeout + 5000)

    child.on('exit', () => clearTimeout(killTimer))
  })
}
