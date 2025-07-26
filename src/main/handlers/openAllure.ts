import { spawn } from 'child_process'
import path from 'path'
import { appState } from './appState'

const handler = (): Promise<{ success: boolean; output?: string; error?: string }> => {
  return new Promise((resolve) => {
    if (!appState.projectPath) {
      resolve({ success: false, error: 'Project path not set' })
      return
    }

    const allureResultsDir = path.join(appState.projectPath, 'allure-results')
    const command = 'allure'
    const args = ['generate', allureResultsDir, '--clean', '-o', 'allure-report']

    const child = spawn(command, args, {
      cwd: appState.projectPath,
      shell: true
    })

    let stderr = ''

    child.stdout.on('data', () => {})

    child.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    child.on('close', (code) => {
      if (code === 0) {
        const openCommand = 'allure'
        const openArgs = ['open', 'allure-report']
        const openChild = spawn(openCommand, openArgs, {
          cwd: appState.projectPath!,
          shell: true
        })

        openChild.on('close', (openCode) => {
          if (openCode === 0) {
            resolve({ success: true, output: 'Allure report opened' })
          } else {
            resolve({ success: false, error: 'Failed to open Allure report' })
          }
        })
      } else {
        resolve({ success: false, error: stderr })
      }
    })
  })
}

export default handler
