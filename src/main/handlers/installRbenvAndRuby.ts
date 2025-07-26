import { spawn } from 'child_process'

const handler = (): Promise<{ success: boolean; output?: string; error?: string }> => {
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
