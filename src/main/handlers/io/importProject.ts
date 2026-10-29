import { dialog, BrowserWindow } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { appState } from '../appState'
import { backupSuitesFile, persistActiveSuites } from '../suitePersistence'
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
  isCurrent,
  lockedError,
  PROJECT_CHANGED_ERROR
} from '../tests/suiteStore'

export default async function importProject(
  mainWindow: BrowserWindow
): Promise<{ success: boolean; error?: string }> {
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

    const projectPath = result.filePaths[0]
    const subdirectories = fs
      .readdirSync(projectPath, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name)

    const imported: Suite[] = []
    const toConfirm: ImportedTest[] = []

    for (const suiteDir of subdirectories) {
      const suitePath = path.join(projectPath, suiteDir)
      const suiteName = suiteDir

      const newSuite: Suite = {
        id: randomUUID(),
        name: suiteName,
        tests: []
      }

      const stepIds = new Set<string>()
      const files = fs.readdirSync(suitePath)
      for (const file of files) {
        if (path.extname(file) === '.rb') {
          const filePath = path.join(suitePath, file)
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
          toConfirm.push({ ...newTest, fromJson: header.fromJson })
        }
      }
      imported.push(newSuite)
    }

    if (!(await confirmCustomCode(mainWindow, toConfirm))) {
      return { success: false, error: importCancelled() }
    }

    if (store && !isCurrent(store)) return { success: false, error: PROJECT_CHANGED_ERROR }
    // Importing replaces every suite, so keep a copy of the current file first.
    // If the copy fails the import stops, rather than risk losing the user's suites.
    const activePath = store?.projectPath ?? appState.projectPath
    if (activePath) await backupSuitesFile(activePath)

    if (store) {
      // The replaced suites' tests keep their files: they stay in the project as recorded tests
      const { failed } = await addSuites(store, imported, { replace: true })
      broadcast(store)
      mainWindow.reload()
      return failed > 0 ? { success: false, error: importFailed(failed) } : { success: true }
    }

    appState.suites.clear()
    imported.forEach((suite) => appState.suites.set(suite.id, suite))
    await persistActiveSuites()
    mainWindow.webContents.send('suite-updated', Array.from(appState.suites.values()))
    mainWindow.reload()

    return { success: true }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return { success: false, error: errorMessage }
  }
}
