import { BrowserWindow, dialog } from 'electron'
import fs from 'fs'
import type { TestData } from '@foundation/Types/testData'
import { appState } from '../appState'
import { getExportExtension, getExportFilters } from '../frameworkTemplates'
import { generateRspecFile, toAutomation } from '../../codegen/testFile'
import { migrateLegacySteps } from '../../codegen/legacy'
import { writeExportHeader } from '../../codegen/exportHeader'
import { safeError } from '../../utils/safeLog'

export default async ({
  testName,
  steps
}: TestData): Promise<{ success: boolean; path?: string; error?: string }> => {
  const window = BrowserWindow.getFocusedWindow()
  if (!window) {
    return { success: false, error: 'No focused window available to show the save dialog.' }
  }

  const framework = appState.projectFramework
  const ext = getExportExtension(framework)
  const defaultFileName = `${testName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.${ext}`

  const { canceled, filePath } = await dialog.showSaveDialog(window, {
    title: 'Export Test Script',
    defaultPath: defaultFileName,
    buttonLabel: 'Export',
    filters: getExportFilters(framework)
  })

  if (canceled || !filePath) {
    return { success: false, error: 'Export cancelled by user.' }
  }

  const migrated = migrateLegacySteps(steps)
  const scriptContent =
    writeExportHeader({ testName, steps: migrated }) +
    generateRspecFile(
      { name: testName, steps: migrated },
      toAutomation(appState.projectAutomation),
      appState.recorderSettings
    )

  try {
    fs.writeFileSync(filePath, scriptContent, 'utf8')

    if (process.platform !== 'win32') {
      fs.chmodSync(filePath, '755')
    }

    return { success: true, path: filePath }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    safeError('Failed to write or set permissions for the script:', error)
    return { success: false, error: errorMessage }
  }
}
