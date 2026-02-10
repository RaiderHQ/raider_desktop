/**
 * Bash shell executor for Unix-like systems (macOS and Linux)
 *
 * Wraps the existing bash command execution logic, maintaining backward
 * compatibility with existing handlers while providing the ShellExecutor interface.
 */

import { exec } from 'child_process'
import { ShellExecutor, type ShellExecutionOptions, type ShellExecutionResult } from '../ShellExecutor'
import type { SupportedPlatform } from '../../utils/platformDetection'

export class BashExecutor extends ShellExecutor {
  constructor(platform: SupportedPlatform) {
    super()
    this.platform = platform
  }

  /**
   * Execute a bash command
   * @param command - The bash command to execute
   * @param options - Execution options
   * @returns Promise resolving to execution result
   */
  async execute(command: string, options?: ShellExecutionOptions): Promise<ShellExecutionResult> {
    return new Promise((resolve) => {
      const execOptions = {
        ...options,
        shell: options?.shell || '/bin/bash'
      }

      exec(command, execOptions, (error, stdout, stderr) => {
        resolve({
          success: !error,
          output: stdout.trim(),
          error: error ? error.message : stderr.trim() || undefined,
          exitCode: error?.code
        })
      })
    })
  }

  /**
   * Check if a command exists using bash's `command -v`
   * @param command - The command name to check
   * @returns Promise resolving to true if command exists
   */
  async commandExists(command: string): Promise<boolean> {
    const result = await this.execute(`command -v ${command} &> /dev/null`)
    return result.success
  }
}
