/**
 * Queries Windows Registry for RubyInstaller installation paths
 *
 * RubyInstaller stores installation metadata in the Windows Registry at:
 * HKLM\SOFTWARE\RubyInstaller\MRI
 *
 * This handler searches for Ruby 3.x installations and returns the install path.
 */

import { exec } from 'child_process'

/**
 * Query Windows Registry for RubyInstaller installation path
 * @returns Promise resolving to installation path or null if not found
 */
export async function getRubyInstallerPath(): Promise<string | null> {
  return new Promise((resolve) => {
    // Query registry for RubyInstaller installations
    const regQuery = 'reg query "HKLM\\SOFTWARE\\RubyInstaller\\MRI" /s'

    exec(regQuery, { shell: 'powershell.exe' }, (error, stdout) => {
      if (error) {
        // Registry key doesn't exist or access denied
        resolve(null)
        return
      }

      // Parse registry output to find InstallLocation
      // Format: InstallLocation    REG_SZ    C:\Ruby31-x64
      const lines = stdout.split('\n')
      const installPaths: string[] = []

      for (const line of lines) {
        if (line.includes('InstallLocation')) {
          const match = line.match(/InstallLocation\s+REG_SZ\s+(.+)/)
          if (match) {
            const path = match[1].trim()
            installPaths.push(path)
          }
        }
      }

      // Check each installation path to find Ruby 3.x
      if (installPaths.length === 0) {
        resolve(null)
        return
      }

      // Try each path to find a Ruby 3.x installation
      checkNextPath(0)

      function checkNextPath(index: number): void {
        if (index >= installPaths.length) {
          resolve(null)
          return
        }

        const path = installPaths[index]
        const rubyExe = `"${path}\\bin\\ruby.exe"`

        exec(`${rubyExe} -v`, (err, versionOutput) => {
          if (!err && versionOutput.match(/ruby 3\./)) {
            // Found Ruby 3.x
            resolve(path)
          } else {
            // Try next path
            checkNextPath(index + 1)
          }
        })
      }
    })
  })
}

/**
 * Get Ruby version from a specific installation path
 * @param rubyPath - The installation path (e.g., C:\Ruby31-x64)
 * @returns Promise resolving to version string or null
 */
export async function getRubyVersion(rubyPath: string): Promise<string | null> {
  return new Promise((resolve) => {
    const rubyExe = `"${rubyPath}\\bin\\ruby.exe"`

    exec(`${rubyExe} -v`, (error, stdout) => {
      if (error) {
        resolve(null)
        return
      }

      // Parse version from output: "ruby 3.1.6p260 (2024-05-29 revision ...)"
      const match = stdout.match(/ruby (\d+\.\d+\.\d+)/)
      if (match) {
        resolve(match[1])
      } else {
        resolve(null)
      }
    })
  })
}

export default getRubyInstallerPath
