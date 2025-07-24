import { dialog, BrowserWindow } from 'electron'
import * as fs from 'fs'
import { appState } from './appState'
import type { Test } from '@foundation/Types/test'
import { randomUUID } from 'crypto'

export default async function importTest(mainWindow: BrowserWindow, suiteId: string) {
  if (!mainWindow) {
    return { success: false, error: 'Main window not found' }
  }
  try {
    if (!suiteId) {
      return { success: false, error: 'No suite selected' }
    }

    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'Ruby files', extensions: ['rb'] }]
    })

    if (result.canceled || !result.filePaths.length) {
      return { success: false, error: 'No file selected' }
    }

    const filePath = result.filePaths[0]
    const fileContent = fs.readFileSync(filePath, 'utf-8')

    const testNameMatch = fileContent.match(/# Test: (.*)/)
    const testName = testNameMatch ? testNameMatch[1] : 'Unnamed Test'

    const stepsMatch = fileContent.match(/begin\n([\s\S]*?)\n  puts "Test '.*' passed successfully!"/)
    const steps = stepsMatch ? stepsMatch[1].trim().split('\n').map(step => step.trim()) : []

    const suite = appState.suites.get(suiteId)
    if (!suite) {
      return { success: false, error: 'Suite not found' }
    }

    const newTest: Test = {
      id: randomUUID(),
      name: testName,
      steps: steps,
    }

    if (suite.tests.some((t) => t.name === newTest.name)) {
      return { success: false, error: 'A test with this name already exists in the suite.' }
    }

    suite.tests.push(newTest)
    appState.suites.set(suiteId, suite)
    mainWindow.webContents.send('suite-updated', Array.from(appState.suites.values()))

    return { success: true, test: newTest }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return { success: false, error: errorMessage }
  }
}