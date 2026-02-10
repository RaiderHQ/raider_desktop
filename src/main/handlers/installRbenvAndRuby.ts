import { spawn } from 'child_process'
import { isWindows } from '../utils/platformDetection'

const handler = (): Promise<{ success: boolean; output?: string; error?: string }> => {
  // Windows: Provide installation guidance instead of attempting to install rbenv
  if (isWindows()) {
    return Promise.resolve({
      success: false,
      error: `Ruby installation required for Windows.

Please install Ruby using one of these methods:

1. RubyInstaller (Recommended):
   - Visit: https://rubyinstaller.org/downloads/
   - Download: Ruby 3.1.6 with DevKit
   - Run installer and select "Add Ruby to PATH"

2. Chocolatey:
   - Open PowerShell as Administrator
   - Run: choco install ruby

After installation, restart Raider Desktop to detect Ruby.`
    })
  }

  // Unix (macOS/Linux): Proceed with rbenv installation
  return new Promise((resolve) => {
    const command = `
      if ! command -v rbenv &> /dev/null; then
        echo "rbenv not found, installing..."
        /bin/bash -c "$(curl -fsSL https://github.com/rbenv/rbenv-installer/raw/HEAD/bin/rbenv-installer)"
      fi

      if ! rbenv versions | grep -q "3.1.6"; then
        echo "Ruby 3.1.6 not found, installing..."
        rbenv install 3.1.6
      fi

      rbenv shell 3.1.6
      gem install bundler
    `

    const childProcess = spawn(command, {
      shell: true,
      env: {
        ...process.env,
        PATH: `${process.env.HOME}/.rbenv/bin:${process.env.PATH}`
      }
    })

    let output = ''
    childProcess.stdout.on('data', (data) => {
      output += data.toString()
    })

    childProcess.stderr.on('data', (data) => {
      output += data.toString()
    })

    childProcess.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, output })
      } else {
        resolve({ success: false, error: output })
      }
    })
  })
}

export default handler
