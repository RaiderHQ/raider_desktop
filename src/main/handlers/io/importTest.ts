import { dialog, BrowserWindow } from 'electron'
import * as fs from 'fs'
import { appState } from '../appState'
import { persistActiveSuites } from '../suitePersistence'
import type { Test } from '@foundation/Types/test'
import { randomUUID } from 'crypto'
import { readExportHeader, withUniqueIds } from '../../codegen/exportHeader'

export default async function importTest(
  mainWindow: BrowserWindow,
  suiteId: string
): Promise<{ success: boolean; test?: Test; error?: string }> {
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

    const suite = appState.suites.get(suiteId)
    if (!suite) {
      return { success: false, error: 'Suite not found' }
    }

    // Exported files carry their steps as JSON; older files hold Ruby lines
    const header = readExportHeader(fileContent)
    const stepIds = new Set(suite.tests.flatMap((t) => t.steps.map((step) => step.id)))
    const newTest: Test = {
      id: randomUUID(),
      name: header.testName ?? 'Unnamed Test',
      url: '',
      steps: withUniqueIds(header.steps ?? [], stepIds)
    }

    if (suite.tests.some((t) => t.name === newTest.name)) {
      return { success: false, error: 'A test with this name already exists in the suite.' }
    }

    suite.tests.push(newTest)
    appState.suites.set(suiteId, suite)
    await persistActiveSuites()
    mainWindow.webContents.send('suite-updated', Array.from(appState.suites.values()))

    return { success: true, test: newTest }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return { success: false, error: errorMessage }
  }
}
