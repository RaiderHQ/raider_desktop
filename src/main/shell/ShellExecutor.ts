/**
 * Abstract base class for cross-platform shell command execution
 *
 * Provides a unified interface for executing shell commands across different
 * platforms (Windows PowerShell, Unix bash/zsh). Uses factory pattern to create
 * platform-specific executors at runtime.
 */

import { detectPlatform, type SupportedPlatform } from '../utils/platformDetection'
import { BashExecutor } from './executors/BashExecutor'
import { PowerShellExecutor } from './executors/PowerShellExecutor'

export interface ShellExecutionResult {
  success: boolean
  output: string
  error?: string
  exitCode?: number
}

export interface ShellExecutionOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
  timeout?: number
  shell?: string
}

export abstract class ShellExecutor {
  protected platform: SupportedPlatform

  constructor() {
    this.platform = detectPlatform()
  }

  /**
   * Factory method to create platform-appropriate shell executor
   * @returns Platform-specific shell executor instance
   */
  static create(): ShellExecutor {
    const platform = detectPlatform()
    if (platform === 'win32') {
      return new PowerShellExecutor()
    }
    // macOS and Linux use bash
    return new BashExecutor(platform)
  }

  /**
   * Execute a shell command
   * @param command - The command to execute
   * @param options - Execution options (working directory, environment, etc.)
   * @returns Promise resolving to execution result
   */
  abstract execute(command: string, options?: ShellExecutionOptions): Promise<ShellExecutionResult>

  /**
   * Check if a command exists in the system PATH
   * @param command - The command name to check
   * @returns Promise resolving to true if command exists
   */
  abstract commandExists(command: string): Promise<boolean>

  /**
   * Get the platform this executor is running on
   * @returns The platform identifier
   */
  getPlatform(): SupportedPlatform {
    return this.platform
  }
}
