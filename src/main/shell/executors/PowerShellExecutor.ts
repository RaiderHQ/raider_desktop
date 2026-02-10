/**
 * PowerShell executor for Windows systems
 *
 * Provides PowerShell command execution with automatic translation of common
 * bash patterns. This allows existing handlers to work on Windows with minimal changes.
 *
 * Translation patterns:
 * - eval "$(rbenv init -)" → Removed (rbenv doesn't exist on Windows)
 * - command -v X → Get-Command X -ErrorAction SilentlyContinue
 * - 2> /dev/null → 2>$null
 * - &> /dev/null → >$null 2>&1
 * - export VAR="value" → $env:VAR="value"
 */

import { exec } from 'child_process'
import { ShellExecutor, type ShellExecutionOptions, type ShellExecutionResult } from '../ShellExecutor'

export class PowerShellExecutor extends ShellExecutor {
  constructor() {
    super()
    this.platform = 'win32'
  }

  /**
   * Execute a PowerShell command with automatic bash translation
   * @param command - The command to execute (bash or PowerShell syntax)
   * @param options - Execution options
   * @returns Promise resolving to execution result
   */
  async execute(command: string, options?: ShellExecutionOptions): Promise<ShellExecutionResult> {
    const translatedCommand = this.translateFromBash(command)

    return new Promise((resolve) => {
      const execOptions = {
        shell: 'powershell.exe',
        ...options
      }

      exec(translatedCommand, execOptions, (error, stdout, stderr) => {
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
   * Translates common bash patterns to PowerShell equivalents
   * @param command - The bash command to translate
   * @returns PowerShell-compatible command
   */
  private translateFromBash(command: string): string {
    let translated = command

    // Remove rbenv/rvm initialization (Unix-only version managers)
    // Pattern: eval "$(rbenv init -)" && rbenv shell 3.1.6 &&
    translated = translated.replace(/eval "\$\([^)]+\)"\s*&&\s*/g, '')
    translated = translated.replace(/rbenv shell [^\s]+\s*&&\s*/g, '')
    translated = translated.replace(/source \$\(brew --prefix rvm\)\/scripts\/rvm\s*&&\s*/g, '')
    translated = translated.replace(/rvm [^\s]+ do\s*/g, '')

    // Translate command existence checks
    // bash: command -v X → PowerShell: Get-Command X -ErrorAction SilentlyContinue
    translated = translated.replace(/command -v (\S+)/g, 'Get-Command $1 -ErrorAction SilentlyContinue')

    // Translate stderr redirection
    // bash: 2> /dev/null → PowerShell: 2>$null
    translated = translated.replace(/2>\s*\/dev\/null/g, '2>$null')

    // Translate combined stdout/stderr redirection
    // bash: &> /dev/null → PowerShell: >$null 2>&1
    translated = translated.replace(/&>\s*\/dev\/null/g, '>$null 2>&1')

    // Translate environment variable exports
    // bash: export VAR="value" → PowerShell: $env:VAR="value"
    translated = translated.replace(/export (\w+)="([^"]+)"/g, '$env:$1="$2"')

    // Translate which command
    // bash: which X → PowerShell: Get-Command X | Select-Object -ExpandProperty Path
    translated = translated.replace(/which\s+(\S+)/g, 'Get-Command $1 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Path')

    return translated
  }

  /**
   * Check if a command exists using PowerShell's Get-Command
   * @param command - The command name to check
   * @returns Promise resolving to true if command exists
   */
  async commandExists(command: string): Promise<boolean> {
    const result = await this.execute(`Get-Command ${command} -ErrorAction SilentlyContinue`)
    return result.success && result.output.trim() !== ''
  }
}
