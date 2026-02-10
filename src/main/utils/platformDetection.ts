/**
 * Platform detection utilities for cross-platform compatibility
 *
 * Provides functions to detect the current operating system and determine
 * the appropriate shell for command execution (bash for Unix, PowerShell for Windows)
 */

export type SupportedPlatform = 'darwin' | 'win32' | 'linux'
export type ShellType = 'bash' | 'zsh' | 'powershell'

/**
 * Detects the current platform
 * @returns The current platform identifier
 */
export function detectPlatform(): SupportedPlatform {
  return process.platform as SupportedPlatform
}

/**
 * Determines the preferred shell for the given platform
 * @param platform - The platform to check (defaults to current platform)
 * @returns The preferred shell type
 */
export function getPreferredShell(platform?: SupportedPlatform): ShellType {
  const targetPlatform = platform || detectPlatform()
  if (targetPlatform === 'win32') {
    return 'powershell'
  }
  // Default to bash for macOS and Linux
  return 'bash'
}

/**
 * Checks if the current platform is Windows
 * @returns true if running on Windows
 */
export function isWindows(): boolean {
  return process.platform === 'win32'
}

/**
 * Checks if the current platform is macOS
 * @returns true if running on macOS
 */
export function isMacOS(): boolean {
  return process.platform === 'darwin'
}

/**
 * Checks if the current platform is Linux
 * @returns true if running on Linux
 */
export function isLinux(): boolean {
  return process.platform === 'linux'
}

/**
 * Checks if the current platform is Unix-like (macOS or Linux)
 * @returns true if running on macOS or Linux
 */
export function isUnix(): boolean {
  return isMacOS() || isLinux()
}
