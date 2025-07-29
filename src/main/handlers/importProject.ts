import { dialog, BrowserWindow } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { appState } from './appState'
import type { Suite } from '@foundation/Types/suite'
import type { Test } from '@foundation/Types/test'
import { randomUUID } from 'crypto'

export default async function importProject(
  mainWindow: BrowserWindow
): Promise<{ success: boolean; error?: string }> {
  if (!mainWindow) {
    return { success: false, error: 'Main window not found' }
  }
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    })

    if (result.canceled || !result.filePaths.length) {
      return { success: false, error: 'No directory selected' }
    }

    const projectPath = result.filePaths[0]
    const subdirectories = fs
      .readdirSync(projectPath, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name)

    appState.suites.clear()

    for (const suiteDir of subdirectories) {
      const suitePath = path.join(projectPath, suiteDir)
      const suiteName = suiteDir

      const newSuite: Suite = {
        id: randomUUID(),
        name: suiteName,
        tests: []
      }

      const files = fs.readdirSync(suitePath)
      for (const file of files) {
        if (path.extname(file) === '.rb') {
          const filePath = path.join(suitePath, file)
          const fileContent = fs.readFileSync(filePath, 'utf-8')

          const testNameMatch = fileContent.match(/# Test: (.*)/)
          const testName = testNameMatch ? testNameMatch[1] : path.basename(file, '.rb')

          const stepsMatch = fileContent.match(
            /begin\n([\s\S]*?)\n {2}puts "Test '.*' passed successfully!"/
          )
          const steps = stepsMatch
            ? stepsMatch[1]
                .trim()
                .split('\n')
                .map((step) => step.trim())
            : []

          const newTest: Test = {
            id: randomUUID(),
            name: testName,
            url: '',
            steps: steps
          }
          newSuite.tests.push(newTest)
        }
      }
      appState.suites.set(newSuite.id, newSuite)
    }

    mainWindow.webContents.send('suite-updated', Array.from(appState.suites.values()))
    mainWindow.reload()

    return { success: true }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return { success: false, error: errorMessage }
  }
}
