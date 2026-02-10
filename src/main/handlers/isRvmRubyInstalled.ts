import { exec } from 'child_process'
import { isWindows } from '../utils/platformDetection'

const handler = (): Promise<{ success: boolean; version?: string; error?: string }> => {
  // RVM is Unix-only (bash script), skip on Windows
  if (isWindows()) {
    return Promise.resolve({
      success: false,
      error: 'RVM is not available on Windows. Use RubyInstaller or Chocolatey instead.'
    })
  }

  return new Promise((resolve) => {
    exec('rvm list strings', (error, stdout, stderr) => {
      if (error) {
        resolve({ success: false, error: stderr.trim() })
        return
      }

      const versions = stdout.trim().split('\n')
      const suitableVersion = versions.find((version) => {
        const match = version.match(/^ruby-(\d+)\.(\d+)\.(\d+)/)
        if (match) {
          const major = parseInt(match[1], 10)
          return major >= 3
        }
        return false
      })

      if (suitableVersion) {
        resolve({ success: true, version: suitableVersion })
      } else {
        resolve({ success: false, error: 'No suitable Ruby version found with rvm.' })
      }
    })
  })
}

export default handler
