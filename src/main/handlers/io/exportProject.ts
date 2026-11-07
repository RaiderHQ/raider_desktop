import { BrowserWindow, dialog } from 'electron'
import fs from 'fs'
import path from 'path'
import { appState } from '../appState'
import { generateRspecFile, toAutomation } from '../../codegen/testFile'
import { migrateLegacyTest } from '../../codegen/legacy'
import { writeExportHeader } from '../../codegen/exportHeader'
import { hashRuby } from '../tests/codeHash'
import { slugify } from '../tests/recordedTests'
import { writeSidecar } from '../tests/sidecar'
import { normalizeTags } from '../../../shared/tags'
import { safeError } from '../../utils/safeLog'
import type { Sidecar } from '../../../shared/types/projectTest'

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

  const automation = toAutomation(appState.projectAutomation)
  // Taken once: the project may change while the files are written
  const tests = Array.from(appState.tests.values())

  try {
    if (!fs.existsSync(filePath)) {
      fs.mkdirSync(filePath)
    }

    // One spec file per test, flat, each with its record in .raider/tests/ so that
    // importing the folder again keeps the steps and the tags
    const used = new Set<string>()
    const now = new Date().toISOString()
    for (const test of tests) {
      const slug = slugify(test.name)
      let name = `${slug}_spec.rb`
      for (let n = 2; used.has(name); n++) name = `${slug}_${n}_spec.rb`
      used.add(name)

      const migrated = migrateLegacyTest(test)
      const tags = normalizeTags(test.tags)
      const scriptContent =
        writeExportHeader({ testName: test.name, steps: migrated.steps }) +
        generateRspecFile({ ...migrated, tags }, automation, appState.recorderSettings)
      const testFilePath = path.join(filePath, name)
      fs.writeFileSync(testFilePath, scriptContent, 'utf8')
      if (process.platform !== 'win32') {
        fs.chmodSync(testFilePath, '755')
      }
      const sidecar: Sidecar = {
        version: 1,
        id: test.id,
        name: test.name,
        url: test.url ?? '',
        steps: migrated.steps,
        file: name,
        automation,
        hash: hashRuby(scriptContent),
        ...(tags.length > 0 && { tags }),
        createdAt: now,
        updatedAt: now
      }
      await writeSidecar(filePath, sidecar)
    }

    return { success: true, path: filePath }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    safeError('Failed to export project:', error)
    return { success: false, error: errorMessage }
  }
}
