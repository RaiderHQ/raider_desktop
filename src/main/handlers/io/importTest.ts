import { dialog, BrowserWindow } from 'electron'
import { lastDialogDirectory, rememberDialogPick } from '../../utils/dialogDirectory'
import * as fs from 'fs'
import { appState } from '../appState'
import { persistActiveSuites } from '../suitePersistence'
import type { Test } from '@foundation/Types/test'
import { randomUUID } from 'crypto'
import { readExportHeader, startUrl, withUniqueIds } from '../../codegen/exportHeader'
import { confirmCustomCode, importCancelled, secretRefused } from './confirmCustomCode'
import {
  activeSuiteMode,
  broadcast,
  filesStore,
  isCurrent,
  lockedError,
  PROJECT_CHANGED_ERROR,
  saveTestInSuite
} from '../tests/suiteStore'

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
    if ((await activeSuiteMode()) === 'locked') return { success: false, error: lockedError() }
    // Taken before the dialog: the import goes to the project that was open when it started
    const store = filesStore()

    const result = await dialog.showOpenDialog(mainWindow, {
      defaultPath: lastDialogDirectory(),
      properties: ['openFile'],
      filters: [{ name: 'Ruby files', extensions: ['rb'] }]
    })
    if (!result.canceled) rememberDialogPick(result.filePaths)

    if (result.canceled || !result.filePaths.length) {
      return { success: false, error: 'No file selected' }
    }

    const filePath = result.filePaths[0]
    const fileContent = fs.readFileSync(filePath, 'utf-8')

    if (store && !isCurrent(store)) return { success: false, error: PROJECT_CHANGED_ERROR }
    const suite = (store?.suites ?? appState.suites).get(suiteId)
    if (!suite) {
      return { success: false, error: 'Suite not found' }
    }

    // Exported files carry their steps as JSON; older files hold Ruby lines
    const header = readExportHeader(fileContent)
    if (header.refusedSecret !== undefined) {
      return { success: false, error: secretRefused(header.refusedSecret) }
    }
    const stepIds = new Set(suite.tests.flatMap((t) => t.steps.map((step) => step.id)))
    const steps = withUniqueIds(header.steps ?? [], stepIds)
    const newTest: Test = {
      id: randomUUID(),
      name: header.testName ?? 'Unnamed Test',
      url: startUrl(steps),
      steps
    }

    if (suite.tests.some((t) => t.name === newTest.name)) {
      return { success: false, error: 'A test with this name already exists in the suite.' }
    }

    if (!(await confirmCustomCode(mainWindow, [newTest]))) {
      return { success: false, error: importCancelled() }
    }
    if (store && !isCurrent(store)) return { success: false, error: PROJECT_CHANGED_ERROR }

    if (store) {
      // A fresh id always gets a new file: an import never replaces one
      const saved = await saveTestInSuite(store, suiteId, newTest)
      if (!saved.success) return saved
      broadcast(store)
      return { success: true, test: saved.test }
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
