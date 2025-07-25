import { spawn } from 'child_process'

const handler = (): Promise<{ success: boolean; output?: string; error?: string }> => {
  return new Promise((resolve) => {
    const installScript = `
      set -e
      if ! command -v rbenv &> /dev/null; then
        echo "rbenv not found. Installing via Homebrew..."
        if ! command -v brew &> /dev/null; then
          echo "Homebrew not found. Please install Homebrew first."
          exit 1
        fi
        brew install rbenv ruby-build
      fi

      LATEST_VERSION=$(rbenv install -l | grep -v - | grep -E "^[0-9]+\\.[0-9]+\\.[0-9]+$" | tail -n 1)
      if [ -z "$LATEST_VERSION" ]; then
        echo "Could not determine the latest stable Ruby version."
        exit 1
      fi

      echo "Installing Ruby $LATEST_VERSION..."
      rbenv install $LATEST_VERSION --skip-existing
      rbenv global $LATEST_VERSION
      echo "Successfully installed and set Ruby $LATEST_VERSION as global."
    `

    const process = spawn('bash', ['-c', installScript], { shell: true })

    let output = ''
    process.stdout.on('data', (data) => {
      console.log(data.toString())
      output += data.toString()
    })

    process.stderr.on('data', (data) => {
      console.error(data.toString())
      output += data.toString()
    })

    process.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, output })
      } else {
        resolve({ success: false, error: output })
      }
    })
  })
}

export default handler
