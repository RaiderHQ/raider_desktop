import { spawn } from 'child_process'

const handler = (
  projectPath: string,
  url: string
): Promise<{ success: boolean; output?: string; error?: string }> => {
  return new Promise((resolve) => {
    const command = `
      require 'yaml'
      config_file_path = File.join("${projectPath}", "config", "config.yml")
      config = YAML.load_file(config_file_path)
      config['base_url'] = '${url}'
      File.write(config_file_path, config.to_yaml)
    `

    const rubyProcess = spawn('ruby', ['-e', command], {
      shell: true,
      cwd: projectPath
    })

    let stdout = ''
    let stderr = ''

    rubyProcess.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    rubyProcess.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    rubyProcess.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, output: stdout.trim() })
      } else {
        resolve({ success: false, error: stderr.trim() })
      }
    })
  })
}

export default handler
