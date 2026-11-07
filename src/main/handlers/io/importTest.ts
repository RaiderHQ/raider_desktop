import { dialog, BrowserWindow } from 'electron'
import { lastDialogDirectory, rememberDialogPick } from '../../utils/dialogDirectory'
import * as fs from 'fs'
import { activationSettled } from '../project/setActiveProject'
import type { Test } from '@foundation/Types/test'
import { randomUUID } from 'crypto'
import { readExportHeader, startUrl, withUniqueIds } from '../../codegen/exportHeader'
import { confirmCustomCode, importCancelled, secretRefused } from './confirmCustomCode'
import { findDescribeLine, tagsFromDescribeLine } from '../../../shared/tags'
import {
  broadcast,
  filesStore,
  isCurrent,
  noStoreError,
  PROJECT_CHANGED_ERROR,
  saveRecordedTestInProject,
  tagSavedTest
} from '../tests/recordedStore'

export default async function importTest(
  mainWindow: BrowserWindow
): Promise<{ success: boolean; test?: Test; error?: string }> {
  if (!mainWindow) {
    return { success: false, error: 'Main window not found' }
  }
  try {
    await activationSettled()
    // Taken before the dialog: the import goes to the project that was open when it started
    const store = filesStore()
    if (!store) return { success: false, error: noStoreError() }

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

    if (!isCurrent(store)) return { success: false, error: PROJECT_CHANGED_ERROR }

    // Exported files carry their steps as JSON; older files hold Ruby lines
    const header = readExportHeader(fileContent)
    if (header.refusedSecret !== undefined) {
      return { success: false, error: secretRefused(header.refusedSecret) }
    }
    const tests = Array.from(store.tests.values())
    const stepIds = new Set(tests.flatMap((t) => t.steps.map((step) => step.id)))
    const steps = withUniqueIds(header.steps ?? [], stepIds)
    const newTest: Test = {
      id: randomUUID(),
      name: header.testName ?? 'Unnamed Test',
      url: startUrl(steps),
      steps
    }

    if (tests.some((t) => t.name === newTest.name)) {
      return { success: false, error: 'A test with this name already exists in the project.' }
    }

    if (!(await confirmCustomCode(mainWindow, [newTest]))) {
      return { success: false, error: importCancelled() }
    }
    if (!isCurrent(store)) return { success: false, error: PROJECT_CHANGED_ERROR }

    // A fresh id always gets a new file: an import never replaces one
    const saved = await saveRecordedTestInProject(store, newTest)
    if (!saved.success) return saved
    // Its tags come from its describe line
    const found = findDescribeLine(fileContent)
    const test = await tagSavedTest(
      store,
      saved.test,
      found ? tagsFromDescribeLine(found.line) : []
    )
    broadcast(store)
    return { success: true, test }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return { success: false, error: errorMessage }
  }
}
