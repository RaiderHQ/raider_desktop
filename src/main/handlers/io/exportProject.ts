import { BrowserWindow, dialog } from 'electron'
import fs from 'fs'
import path from 'path'
import { appState } from '../appState'
import { getExportExtension } from '../frameworkTemplates'
import { generateRspecFile, toAutomation } from '../../codegen/testFile'
import { migrateLegacyTest } from '../../codegen/legacy'
import { writeExportHeader } from '../../codegen/exportHeader'
import { safeError } from '../../utils/safeLog'

export default async (): Promise<{ success: boolean; path?: string; error?: string }> => {
  const window = BrowserWindow.getFocusedWindow()
  if (!window) {
    return { success: false, error: 'No focused window found.' }
  }

  const { canceled, filePath } = await dialog.showSaveDialog(window, {
    title: 'Export Project',
    defaultPath: 'raider-project',
    buttonLabel: 'Export',
    properties: ['createDirectory']
  })

  if (canceled || !filePath) {
    return { success: false, error: 'Export cancelled.' }
  }

  const framework = appState.projectFramework
  const automation = toAutomation(appState.projectAutomation)
  const ext = getExportExtension(framework)

  try {
    if (!fs.existsSync(filePath)) {
      fs.mkdirSync(filePath)
    }

    for (const suite of appState.suites.values()) {
      const suiteFolderPath = path.join(
        filePath,
        suite.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()
      )
      if (!fs.existsSync(suiteFolderPath)) {
        fs.mkdirSync(suiteFolderPath)
      }

      for (const test of suite.tests) {
        const testFileName = `${test.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.${ext}`
        const testFilePath = path.join(suiteFolderPath, testFileName)
        const migrated = migrateLegacyTest(test)
        const scriptContent =
          writeExportHeader({ testName: test.name, suiteName: suite.name, steps: migrated.steps }) +
          generateRspecFile(migrated, automation, appState.recorderSettings)
        fs.writeFileSync(testFilePath, scriptContent, 'utf8')
        if (process.platform !== 'win32') {
          fs.chmodSync(testFilePath, '755')
        }
      }
    }

    return { success: true, path: filePath }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    safeError('Failed to export project:', error)
    return { success: false, error: errorMessage }
  }
}
