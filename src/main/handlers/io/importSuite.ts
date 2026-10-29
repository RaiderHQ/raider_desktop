import { dialog, BrowserWindow } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { appState } from '../appState'
import { persistActiveSuites } from '../suitePersistence'
import type { Suite } from '@foundation/Types/suite'
import type { Test } from '@foundation/Types/test'
import { randomUUID } from 'crypto'
import { readExportHeader, startUrl, withUniqueIds } from '../../codegen/exportHeader'
import { confirmCustomCode, importCancelled, type ImportedTest } from './confirmCustomCode'
import {
  activeSuiteMode,
  addSuites,
  broadcast,
  filesStore,
  importFailed,
  lockedError
} from '../tests/suiteStore'

export default async function importSuite(
  mainWindow: BrowserWindow
): Promise<{ success: boolean; suite?: Suite; error?: string }> {
  if (!mainWindow) {
    return { success: false, error: 'Main window not found' }
  }
  try {
    if ((await activeSuiteMode()) === 'locked') return { success: false, error: lockedError() }
    // Taken before the dialog: the import goes to the project that was open when it started
    const store = filesStore()
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

    const stepIds = new Set<string>()
    const toConfirm: ImportedTest[] = []
    const files = fs.readdirSync(directoryPath)
    for (const file of files) {
      if (path.extname(file) === '.rb') {
        const filePath = path.join(directoryPath, file)
        const fileContent = fs.readFileSync(filePath, 'utf-8')

        // Exported files carry their steps as JSON; older files hold Ruby lines
        const header = readExportHeader(fileContent)
        const steps = withUniqueIds(header.steps ?? [], stepIds)
        const newTest: Test = {
          id: randomUUID(),
          name: header.testName ?? path.basename(file, '.rb'),
          url: startUrl(steps),
          steps
        }
        newSuite.tests.push(newTest)
        toConfirm.push(newTest)
      }
    }

    if (!(await confirmCustomCode(mainWindow, toConfirm))) {
      return { success: false, error: importCancelled() }
    }

    if (store) {
      const { suites, failed } = await addSuites(store, [newSuite])
      broadcast(store)
      if (failed > 0) return { success: false, error: importFailed(failed) }
      return { success: true, suite: suites[0] }
    }

    appState.suites.set(newSuite.id, newSuite)
    await persistActiveSuites()
    mainWindow.webContents.send('suite-updated', Array.from(appState.suites.values()))

    return { success: true, suite: newSuite }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return { success: false, error: errorMessage }
  }
}
