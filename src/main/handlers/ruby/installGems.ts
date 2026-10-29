import { spawn } from 'child_process'
import { quoteShellArg } from '../../utils/shellQuote'

const handler = (
  rubyCommand: string,
  gems: string[]
): Promise<{ success: boolean; output?: string; error?: string }> => {
  return new Promise((resolve) => {
    const command = `${rubyCommand} gem install ${gems.map((gem) => quoteShellArg(gem)).join(' ')}`
    const process = spawn(command, {
      shell: true
    })

    let output = ''
    process.stdout.on('data', (data) => {
      output += data.toString()
    })

    process.stderr.on('data', (data) => {
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
