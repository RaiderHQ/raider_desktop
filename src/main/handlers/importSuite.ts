import { dialog, BrowserWindow } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { appState } from './appState'
import type { Suite } from '@foundation/Types/suite'
import type { Test } from '@foundation/Types/test'
import { randomUUID } from 'crypto'

export default async function importSuite(
  mainWindow: BrowserWindow
): Promise<{ success: boolean; suite?: Suite; error?: string }> {
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

    const directoryPath = result.filePaths[0]
    const suiteName = path.basename(directoryPath)

    if (Array.from(appState.suites.values()).some((s) => s.name === suiteName)) {
      return { success: false, error: 'A suite with this name already exists.' }
    }

    const newSuite: Suite = {
      id: randomUUID(),
      name: suiteName,
      tests: []
    }

    const files = fs.readdirSync(directoryPath)
    for (const file of files) {
      if (path.extname(file) === '.rb') {
        const filePath = path.join(directoryPath, file)
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
    mainWindow.webContents.send('suite-updated', Array.from(appState.suites.values()))

    return { success: true, suite: newSuite }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return { success: false, error: errorMessage }
  }
}
