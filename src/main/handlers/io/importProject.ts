import { dialog, BrowserWindow } from 'electron'
import { lastDialogDirectory, rememberDialogPick } from '../../utils/dialogDirectory'
import * as fs from 'fs'
import * as path from 'path'
import type { Test } from '@foundation/Types/test'
import { randomUUID } from 'crypto'
import { readExportHeader, startUrl, withUniqueIds } from '../../codegen/exportHeader'
import {
  confirmCustomCode,
  importCancelled,
  secretRefused,
  type ImportedTest
} from './confirmCustomCode'
import { readSidecar } from '../tests/sidecar'
import { normalizeTags, tagFromName } from '../../../shared/tags'
import {
  activeSuiteMode,
  broadcast,
  filesStore,
  importFailed,
  isCurrent,
  lockedError,
  NO_PROJECT_ERROR,
  PROJECT_CHANGED_ERROR,
  saveRecordedTestInProject,
  tagSavedTest
} from '../tests/suiteStore'

const SKIP_DIRS = new Set(['node_modules', '.git', 'vendor', '.raider'])

/** Every `.rb` file under `dir`, as POSIX paths relative to it. Links are not followed. */
function rubyFilesUnder(dir: string, prefix = ''): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(path.join(dir, prefix), { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) out.push(...rubyFilesUnder(dir, rel))
    } else if (entry.isFile() && entry.name.endsWith('.rb')) out.push(rel)
  }
  return out.sort()
}

interface ImportedFile extends ImportedTest {
  test: Test
  tags: string[]
}

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
    if (!store) return { success: false, error: NO_PROJECT_ERROR }
    const result = await dialog.showOpenDialog(mainWindow, {
      defaultPath: lastDialogDirectory(),
      properties: ['openDirectory']
    })
    if (!result.canceled) rememberDialogPick(result.filePaths)

    if (result.canceled || !result.filePaths.length) {
      return { success: false, error: 'No directory selected' }
    }

    const root = result.filePaths[0]
    const imported: ImportedFile[] = []
    const stepIds = new Set<string>()

    for (const rel of rubyFilesUnder(root)) {
      const fileContent = fs.readFileSync(path.join(root, rel), 'utf-8')

      // Exported files carry their steps as JSON; older files hold Ruby lines. An export
      // from this app also has a record in .raider/tests/ that holds the tags
      const header = readExportHeader(fileContent)
      if (header.refusedSecret !== undefined) {
        return { success: false, error: secretRefused(header.refusedSecret) }
      }
      const sidecar = await readSidecar(root, rel).catch(() => null)
      const steps = withUniqueIds(header.steps ?? sidecar?.steps ?? [], stepIds)
      const test: Test = {
        id: randomUUID(),
        name: header.testName ?? sidecar?.name ?? path.basename(rel, '.rb'),
        url: startUrl(steps),
        steps
      }
      // A subfolder's name is a tag on the tests it holds
      const folder = path.posix.dirname(rel)
      const folderTag = folder === '.' ? '' : tagFromName(path.posix.basename(folder))
      imported.push({
        name: test.name,
        steps,
        test,
        tags: normalizeTags([...(sidecar?.tags ?? []), ...(folderTag ? [folderTag] : [])])
      })
    }

    if (!(await confirmCustomCode(mainWindow, imported))) {
      return { success: false, error: importCancelled() }
    }

    if (!isCurrent(store)) return { success: false, error: PROJECT_CHANGED_ERROR }

    // Each test gets a fresh id and a file of its own: an import never replaces a test
    let failed = 0
    for (const { test, tags } of imported) {
      if (!isCurrent(store)) return { success: false, error: PROJECT_CHANGED_ERROR }
      try {
        const saved = await saveRecordedTestInProject(store, test)
        if (!saved.success) throw new Error(saved.error)
        await tagSavedTest(store, saved.test, tags)
      } catch {
        failed++
      }
    }
    broadcast(store)
    mainWindow.reload()
    return failed > 0 ? { success: false, error: importFailed(failed) } : { success: true }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return { success: false, error: errorMessage }
  }
}
