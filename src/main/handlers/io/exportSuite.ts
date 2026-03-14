import { BrowserWindow, dialog } from 'electron'
import fs from 'fs'
import path from 'path'
import { appState } from '../appState'
import { generateExportContent, getExportExtension } from '../frameworkTemplates'
import { safeError } from '../../utils/safeLog'

export default async (
  suiteId: string
): Promise<{ success: boolean; path?: string; error?: string }> => {
  const window = BrowserWindow.getFocusedWindow()
  if (!window) {
    return { success: false, error: 'No focused window found.' }
  }

  const suite = appState.suites.get(suiteId)
  if (!suite) {
    return { success: false, error: 'Suite not found.' }
  }

  const { canceled, filePath } = await dialog.showSaveDialog(window, {
    title: 'Export Suite',
    defaultPath: suite.name.replace(/[^a-z0-9]/gi, '_').toLowerCase(),
    buttonLabel: 'Export',
    properties: ['createDirectory']
  })

  if (canceled || !filePath) {
    return { success: false, error: 'Export cancelled.' }
  }

  const framework = appState.projectFramework
  const automation = appState.projectAutomation
  const ext = getExportExtension(framework)

  try {
    if (!fs.existsSync(filePath)) {
      fs.mkdirSync(filePath)
    }

    for (const test of suite.tests) {
      const testFileName = `${test.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.${ext}`
      const testFilePath = path.join(filePath, testFileName)
      const scriptContent = generateExportContent(framework, {
        testName: test.name,
        suiteName: suite.name,
        steps: test.steps,
        automation
      })
      fs.writeFileSync(testFilePath, scriptContent, 'utf8')
      if (process.platform !== 'win32') {
        fs.chmodSync(testFilePath, '755')
      }
    }

    return { success: true, path: filePath }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    safeError('Failed to export suite:', error)
    return { success: false, error: errorMessage }
  }
}
