/**
 * Detects Ruby installations on Windows systems
 *
 * Checks multiple installation sources in order:
 * 1. RubyInstaller (via Windows Registry)
 * 2. Chocolatey package manager
 * 3. System PATH (manual installation)
 *
 * Returns Ruby version and appropriate command prefix for execution.
 */

import { ShellExecutor } from '../../shell/ShellExecutor'
import { getRubyInstallerPath, getRubyVersion } from './getRubyInstallerPath'

export type RubyInstallationSource = 'rubyinstaller' | 'chocolatey' | 'system'

export interface WindowsRubyResult {
  success: boolean
  version?: string
  rubyCommand?: string
  source?: RubyInstallationSource
  error?: string
}

/**
 * Detect Ruby installation on Windows
 * @returns Promise resolving to Ruby installation details
 */
export async function isWindowsRubyInstalled(): Promise<WindowsRubyResult> {
  // 1. Check RubyInstaller via Windows Registry
  const rubyInstallerPath = await getRubyInstallerPath()
  if (rubyInstallerPath) {
    const version = await getRubyVersion(rubyInstallerPath)
    if (version && version.match(/^3\./)) {
      // Use PowerShell syntax to prepend Ruby to PATH
      const prefix = `$env:PATH="${rubyInstallerPath}\\bin;$env:PATH";`
      return {
        success: true,
        version,
        rubyCommand: `${prefix} ruby`,
        source: 'rubyinstaller'
      }
    }
  }

  // 2. Check Chocolatey package manager
  const executor = ShellExecutor.create()
  const chocoCheck = await executor.execute('choco list --local-only ruby --exact')
  if (chocoCheck.success && chocoCheck.output.includes('ruby')) {
    // Parse version from Chocolatey output: "ruby 3.1.6"
    const versionMatch = chocoCheck.output.match(/ruby (\d+\.\d+\.\d+)/)
    if (versionMatch && versionMatch[1].match(/^3\./)) {
      // Chocolatey adds Ruby to PATH automatically
      return {
        success: true,
        version: versionMatch[1],
        rubyCommand: 'ruby',
        source: 'chocolatey'
      }
    }
  }

  // 3. Check system PATH (manual installation or other package manager)
  const systemCheck = await executor.execute('ruby -v')
  if (systemCheck.success) {
    // Parse version from ruby -v output: "ruby 3.1.6p260 ..."
    const versionMatch = systemCheck.output.match(/ruby (\d+\.\d+\.\d+)/)
    if (versionMatch && versionMatch[1].match(/^3\./)) {
      return {
        success: true,
        version: versionMatch[1],
        rubyCommand: 'ruby',
        source: 'system'
      }
    } else if (versionMatch) {
      // Found Ruby but it's version 2.x or older
      return {
        success: false,
        error: `Ruby ${versionMatch[1]} found but version 3.0.0+ is required. Please upgrade Ruby.`
      }
    }
  }

  // No Ruby installation found
  return {
    success: false,
    error: 'No Ruby 3.x installation found. Please install Ruby using RubyInstaller or Chocolatey.'
  }
}

export default isWindowsRubyInstalled
