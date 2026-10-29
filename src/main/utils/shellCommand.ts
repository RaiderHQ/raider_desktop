import { appState } from '../handlers/appState'
import { quoteShellArg } from './shellQuote'

/**
 * quoteShellArg for the current platform, kept under its old name for existing
 * callers. Takes one argument only, so `files.map(shellQuote)` can't pass the
 * index as the platform.
 */
export const shellQuote = (value: string): string => quoteShellArg(value)

/**
 * Platform-aware shell command builder.
 *
 * On macOS/Linux, initializes rbenv before running the command.
 * On Windows, Ruby is expected on PATH (via RubyInstaller), so no
 * version-manager preamble is needed — just cd and run.
 *
 * @param rubyVersion - Optional Ruby version to pin via RBENV_VERSION.
 *   When provided, ensures rbenv uses this version regardless of which
 *   directory the command runs in (avoids falling back to system Ruby
 *   in directories without a .ruby-version file). If omitted, falls
 *   back to the version detected at startup (stored in appState).
 */
export function buildShellCommand(
  projectPath: string,
  command: string,
  rubyVersion?: string
): string {
  if (process.platform === 'win32') {
    return `cd /d ${quoteShellArg(projectPath)} && ${command}`
  }
  const version = rubyVersion || appState.rubyVersion || undefined
  const versionExport = version ? `export RBENV_VERSION=${quoteShellArg(version)} && ` : ''
  return `eval "$(rbenv init - 2>/dev/null || true)" && ${versionExport}cd ${quoteShellArg(projectPath)} && ${command}`
}
