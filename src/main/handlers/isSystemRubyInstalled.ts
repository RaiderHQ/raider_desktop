import { exec } from 'child_process'

const handler = (): Promise<{ success: boolean; version?: string; error?: string }> => {
  return new Promise((resolve) => {
    exec('ruby -v', (error, stdout, stderr) => {
      if (error) {
        resolve({ success: false, error: stderr.trim() })
        return
      }

      const match = stdout.match(/ruby (\d+)\.(\d+)\.(\d+)/)
      if (match) {
        const major = parseInt(match[1], 10)
        if (major >= 3) {
          resolve({ success: true, version: match[0] })
        } else {
          resolve({ success: false, error: `Ruby version ${match[0]} is older than 3.0.0.` })
        }
      } else {
        resolve({ success: false, error: 'Could not parse Ruby version.' })
      }
    })
  })
}

export default handler
