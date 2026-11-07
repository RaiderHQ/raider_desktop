import { dialog, BrowserWindow } from 'electron'
import { lastDialogDirectory, rememberDialogPick } from '../../utils/dialogDirectory'
import { lstat, readdir, readFile } from 'fs/promises'
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
import { activationSettled } from '../project/setActiveProject'
import { readSidecar, SidecarSecretRefusedError } from '../tests/sidecar'
import { findDescribeLine, normalizeTags, tagsFromDescribeLine } from '../../../shared/tags'
import { safeError } from '../../utils/safeLog'
import {
  broadcast,
  filesStore,
  importFailed,
  isCurrent,
  noStoreError,
  PROJECT_CHANGED_ERROR,
  saveRecordedTestInProject,
  tagSavedTest
} from '../tests/recordedStore'

/** The most spec files one import reads. */
export const MAX_IMPORT_FILES = 500
/** The largest spec file or record one import reads. */
export const MAX_IMPORT_BYTES = 1024 * 1024

/** `file` as text, if it is a regular file (no link, no pipe) of at most MAX_IMPORT_BYTES. */
async function readSmallRegularFile(file: string): Promise<string> {
  const stat = await lstat(file)
  if (!stat.isFile()) throw new Error(`Not a regular file: ${path.basename(file)}`)
  if (stat.size > MAX_IMPORT_BYTES) throw new Error(`Too large to import: ${path.basename(file)}`)
  return readFile(file, 'utf-8')
}

export interface ImportProjectResult {
  success: boolean
  error?: string
  imported?: number
  /** Tests whose name the project already has */
  skipped?: number
  failed?: number
}

interface Candidate extends ImportedTest {
  test: Test
  tags: string[]
}

/** A record beside the spec must be a small regular file before anything reads it. */
async function checkSidecarFile(root: string, name: string): Promise<void> {
  const file = path.join(root, '.raider', 'tests', `${name}.json`)
  let stat
  try {
    stat = await lstat(file)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
  if (!stat.isFile()) throw new Error(`Not a regular file: ${name}.json`)
  if (stat.size > MAX_IMPORT_BYTES) throw new Error(`Too large to import: ${name}.json`)
}

/**
 * 'import-project': every top-level `*_spec.rb` of the chosen folder (the flat layout
 * 'export-project' writes). The record in `<folder>/.raider/tests/` gives the tags when
 * there is one; the file's describe line gives them otherwise. Nothing is read from
 * subfolders, and nothing already in the project is replaced or changed.
 */
export default async function importProject(
  mainWindow: BrowserWindow
): Promise<ImportProjectResult> {
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
      properties: ['openDirectory']
    })
    if (!result.canceled) rememberDialogPick(result.filePaths)

    if (result.canceled || !result.filePaths.length) {
      return { success: false, error: 'No directory selected' }
    }

    const root = result.filePaths[0]
    const files = (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith('_spec.rb'))
      .map((entry) => entry.name)
      .sort()
    if (files.length === 0) return { success: false, error: 'There are no *_spec.rb files there.' }
    if (files.length > MAX_IMPORT_FILES) {
      return { success: false, error: `There are more than ${MAX_IMPORT_FILES} spec files there.` }
    }

    const candidates: Candidate[] = []
    const stepIds = new Set<string>()
    let failed = 0
    for (const name of files) {
      try {
        const content = await readSmallRegularFile(path.join(root, name))
        // Exported files carry their steps as JSON; older files hold Ruby lines
        const header = readExportHeader(content)
        if (header.refusedSecret !== undefined) {
          return { success: false, error: secretRefused(header.refusedSecret) }
        }
        await checkSidecarFile(root, name)
        const sidecar = await readSidecar(root, name)
        const steps = withUniqueIds(header.steps ?? sidecar?.steps ?? [], stepIds)
        const test: Test = {
          id: randomUUID(),
          name: header.testName ?? sidecar?.name ?? path.basename(name, '_spec.rb'),
          url: startUrl(steps),
          steps
        }
        const found = findDescribeLine(content)
        candidates.push({
          name: test.name,
          steps,
          test,
          tags: normalizeTags([
            ...(sidecar?.tags ?? []),
            ...(found ? tagsFromDescribeLine(found.line) : [])
          ])
        })
      } catch (error) {
        if (error instanceof SidecarSecretRefusedError) {
          return { success: false, error: secretRefused(error.secretName) }
        }
        safeError(`Could not read ${name} for the import:`, error)
        failed++
      }
    }

    // import-test and import-project agree: a name the project already has is skipped
    const taken = new Set(Array.from(store.tests.values()).map((t) => t.name))
    const fresh = candidates.filter((c) => {
      if (taken.has(c.name)) return false
      taken.add(c.name)
      return true
    })
    const skipped = candidates.length - fresh.length

    if (!(await confirmCustomCode(mainWindow, fresh))) {
      return { success: false, error: importCancelled() }
    }

    // Each test gets a fresh id and a file of its own: an import never replaces a test
    let imported = 0
    for (const { test, tags } of fresh) {
      if (!isCurrent(store)) return { success: false, error: PROJECT_CHANGED_ERROR }
      try {
        const saved = await saveRecordedTestInProject(store, test)
        if (!saved.success) throw new Error(saved.error)
        await tagSavedTest(store, saved.test, tags)
        imported++
      } catch (error) {
        safeError(`Could not import ${test.name}:`, error)
        failed++
      }
    }
    broadcast(store)
    return {
      success: failed === 0,
      imported,
      skipped,
      failed,
      ...(failed > 0 && { error: importFailed(failed) })
    }
  } catch (error: unknown) {
    safeError('Importing the project failed:', error)
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}
