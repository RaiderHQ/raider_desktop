import { appState } from '../handlers/appState'

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
    return `cd /d "${projectPath}" && ${command}`
  }
  const version = rubyVersion || appState.rubyVersion || undefined
  const versionExport = version ? `export RBENV_VERSION=${version} && ` : ''
  return `eval "$(rbenv init - 2>/dev/null || true)" && ${versionExport}cd "${projectPath}" && ${command}`
}
