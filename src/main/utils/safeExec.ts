import { exec, ExecOptions } from 'child_process'

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

/**
 * Wraps child_process.exec with a mandatory timeout to prevent indefinite hangs.
 * All shell command execution in the main process should go through this wrapper.
 */
export function safeExec(
  command: string,
  options: ExecOptions & { timeout?: number } = {}
): Promise<SafeExecResult> {
  const timeout = Math.min(options.timeout ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS)

  return new Promise((resolve) => {
    const child = exec(command, { ...options, timeout, encoding: 'utf8' }, (error, stdout, stderr) => {
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
    })

    // Safety net: if the child process hasn't resolved after timeout + 5s, force kill
    const killTimer = setTimeout(() => {
      if (!child.killed) {
        child.kill('SIGKILL')
      }
    }, timeout + 5000)

    child.on('exit', () => clearTimeout(killTimer))
  })
}
