import { BrowserWindow, dialog } from 'electron'
import fs from 'fs/promises'
import path from 'path'
import { appState } from '../appState'
import { CODEGEN_VERSION, generateRspecFile } from '../../codegen/testFile'
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

  // Taken once: the project may change while the files are written
  const tests = Array.from(appState.tests.values())
  const activeProject = appState.projectPath

  try {
    const refusal = await refuseTarget(filePath, activeProject)
    if (refusal) return { success: false, error: refusal }
    await fs.mkdir(filePath, { recursive: true })

    // One spec file per test, flat, each with its record in .raider/tests/ so that
    // importing the folder again keeps the steps and the tags. Nothing is ever overwritten.
    const used = new Set<string>()
    const now = new Date().toISOString()
    let failed = 0
    for (const test of tests) {
      const slug = slugify(test.name)
      let name = `${slug}_spec.rb`
      for (let n = 2; used.has(name); n++) name = `${slug}_${n}_spec.rb`
      used.add(name)
      try {
        const migrated = migrateLegacyTest(test, appState.recorderSettings.testIdAttribute)
        const tags = normalizeTags(test.tags)
        const scriptContent =
          writeExportHeader({ testName: test.name, steps: migrated.steps }) +
          generateRspecFile({ ...migrated, tags }, appState.recorderSettings)
        await fs.writeFile(path.join(filePath, name), scriptContent, {
          encoding: 'utf8',
          flag: 'wx',
          mode: process.platform === 'win32' ? undefined : 0o755
        })
        const sidecar: Sidecar = {
          version: 1,
          id: test.id,
          name: test.name,
          url: test.url ?? '',
          steps: migrated.steps,
          file: name,
          hash: hashRuby(scriptContent),
          codegen: CODEGEN_VERSION,
          ...(tags.length > 0 && { tags }),
          createdAt: now,
          updatedAt: now
        }
        await writeSidecar(filePath, sidecar, { exclusive: true })
      } catch (error) {
        safeError(`Could not export ${test.name}:`, error)
        failed++
      }
    }
    if (failed > 0) {
      return {
        success: false,
        path: filePath,
        error: `${failed} ${failed === 1 ? 'test' : 'tests'} could not be exported.`
      }
    }
    return { success: true, path: filePath }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    safeError('Failed to export project:', error)
    return { success: false, error: errorMessage }
  }
}

/** The real path of `target`, or of its nearest existing parent with the rest appended. */
async function realPathOf(target: string): Promise<string> {
  const resolved = path.resolve(target)
  try {
    return await fs.realpath(resolved)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    const parent = path.dirname(resolved)
    if (parent === resolved) return resolved
    return path.join(await realPathOf(parent), path.basename(resolved))
  }
}

/**
 * Why `target` can't take an export, or null: inside the open project, or already holding
 * spec files or a .raider folder. Other files (notes, a README) do not refuse it; every file
 * written is created exclusively, so nothing that appears later is ever overwritten.
 */
async function refuseTarget(target: string, projectPath: string | null): Promise<string | null> {
  if (projectPath) {
    const project = await realPathOf(projectPath)
    const real = await realPathOf(target)
    if (real === project || real.startsWith(project + path.sep)) {
      return 'Choose a folder outside the open project.'
    }
  }
  try {
    const entries = await fs.readdir(target)
    if (entries.some((name) => name.endsWith('_spec.rb') || name === '.raider')) {
      return 'Choose an empty folder.'
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  return null
}
