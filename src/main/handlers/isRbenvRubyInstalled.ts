import { exec } from 'child_process'
import { isWindows } from '../utils/platformDetection'

const handler = (): Promise<{ success: boolean; version?: string; error?: string }> => {
  // rbenv is Unix-only (bash script), skip on Windows
  if (isWindows()) {
    return Promise.resolve({
      success: false,
      error: 'rbenv is not available on Windows. Use RubyInstaller or Chocolatey instead.'
    })
  }

  return new Promise((resolve) => {
    exec('rbenv versions --bare', (error, stdout, stderr) => {
      if (error) {
        resolve({ success: false, error: stderr.trim() })
        return
      }

      const versions = stdout.trim().split('\n')
      const suitableVersion = versions.find((version) => {
        const match = version.match(/^(\d+)\.(\d+)\.(\d+)/)
        if (match) {
          const major = parseInt(match[1], 10)
          return major >= 3
        }
        return false
      })

      if (suitableVersion) {
        resolve({ success: true, version: suitableVersion })
      } else {
        resolve({ success: false, error: 'No suitable Ruby version found with rbenv.' })
      }
    })
  })
}

export default handler
