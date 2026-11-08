import fs from 'fs/promises'
import { posix } from 'path'
import { shell } from 'electron'
import { appState } from '../appState'
import { activationSettled } from '../project/setActiveProject'
import { NO_PROJECT_ERROR, PROJECT_CHANGED_ERROR } from './recordedStore'
import { assertSpecFile } from './readCodeTest'
import { inTestQueue, isSpecRel, specRoot } from './recordedTests'
import {
  assertRealInside,
  readSidecar,
  resolveInside,
  sidecarPath,
  writeFileAtomic
} from './sidecar'
import { safeError } from '../../utils/safeLog'
import type { ProjectLayout } from '../../../shared/types/projectLayout'

/**
 * The Tests list's Copy, Paste, Duplicate and Delete on spec files. The renderer only ever
 * names project-relative `*_spec.rb` paths; everything is resolved, checked and done here.
 */

/** The largest spec file these handlers read or write */
export const MAX_TEST_FILE_BYTES = 1024 * 1024
const MAX_SUFFIX = 1000

const NOT_FOUND = 'This test could not be found.'
const NOT_READ = 'This test could not be read.'
const NOT_PASTED = 'This test could not be pasted.'
const NOT_TRASHED = 'This test could not be moved to the Trash.'
const TOO_BIG = 'This test file is too big to copy.'

type Fail = { success: false; error: string }
const fail = (error: string): Fail => ({ success: false, error })

/** The open project, but only when it is the one the renderer says it is working on. */
async function openProject(
  projectPath: unknown
): Promise<{ projectPath: string; layout: ProjectLayout } | Fail> {
  await activationSettled()
  const { projectPath: active, layout } = appState
  if (!active || !layout) return fail(NO_PROJECT_ERROR)
  if (projectPath !== active) return fail(PROJECT_CHANGED_ERROR)
  return { projectPath: active, layout }
}

// lstat, so a broken symlink counts as there too
const lstatOrNull = (p: string): Promise<import('fs').Stats | null> =>
  fs.lstat(p).catch((e: NodeJS.ErrnoException) => {
    if (e.code === 'ENOENT') return null
    throw e
  })

/** 'read-test-file': the text of a spec file of the open project, for Copy. */
export async function readTestFile(
  projectPath: unknown,
  fileRel: unknown
): Promise<{ success: true; text: string } | Fail> {
  try {
    const project = await openProject(projectPath)
    if ('error' in project) return project
    if (!isSpecRel(fileRel)) return fail(NOT_FOUND)
    const target = await assertSpecFile(project.projectPath, fileRel)
    if ((await fs.stat(target)).size > MAX_TEST_FILE_BYTES) return fail(TOO_BIG)
    const text = await fs.readFile(target, 'utf-8')
    if (Buffer.byteLength(text, 'utf-8') > MAX_TEST_FILE_BYTES) return fail(TOO_BIG)
    return { success: true, text }
  } catch (error) {
    safeError('Could not read the test file:', error)
    return fail(NOT_READ)
  }
}

const isUnder = (dir: string, root: string): boolean => dir === root || dir.startsWith(`${root}/`)

/**
 * The folder of `fileRel` when it is a spec path whose folder exists in this project, under
 * its spec folder and really inside it (symlinks resolved); else null.
 */
async function existingSpecFolder(
  projectPath: string,
  root: string,
  fileRel: unknown
): Promise<string | null> {
  if (!isSpecRel(fileRel)) return null
  const dir = posix.dirname(fileRel)
  if (!isUnder(dir, root)) return null
  try {
    const abs = resolveInside(projectPath, dir)
    await assertRealInside(projectPath, abs)
    return (await fs.stat(abs)).isDirectory() ? dir : null
  } catch {
    return null
  }
}

/**
 * 'paste-test-file': writes `text` as a new `<base>_copy[_n]_spec.rb`, next to `nearFile`
 * (the selected row), else in the copied file's folder if this project has it, else in the
 * spec folder. Never replaces a file. Returns the new file's project-relative path.
 */
export async function pasteTestFile(
  projectPath: unknown,
  payload: unknown
): Promise<{ success: true; file: string } | Fail> {
  try {
    const project = await openProject(projectPath)
    if ('error' in project) return project
    if (typeof payload !== 'object' || payload === null) return fail(NOT_PASTED)
    const { text, sourceFile, nearFile } = payload as Record<string, unknown>
    if (typeof text !== 'string') return fail(NOT_PASTED)
    if (Buffer.byteLength(text, 'utf-8') > MAX_TEST_FILE_BYTES) return fail(TOO_BIG)
    if (!isSpecRel(sourceFile)) return fail(NOT_PASTED)

    const root = specRoot(project.layout)
    const folder =
      (await existingSpecFolder(project.projectPath, root, nearFile)) ??
      (await existingSpecFolder(project.projectPath, root, sourceFile)) ??
      root
    const folderAbs = resolveInside(project.projectPath, folder)
    await assertRealInside(project.projectPath, folderAbs)
    await fs.mkdir(folderAbs, { recursive: true })
    await assertRealInside(project.projectPath, folderAbs)

    const base = posix.basename(sourceFile).slice(0, -'_spec.rb'.length)
    for (let n = 1; n <= MAX_SUFFIX; n++) {
      const name = n === 1 ? `${base}_copy_spec.rb` : `${base}_copy_${n}_spec.rb`
      const file = posix.join(folder, name)
      const target = resolveInside(folderAbs, name)
      // A stale record for the name would make the new file look recorded
      if (await lstatOrNull(target)) continue
      if (await lstatOrNull(sidecarPath(project.projectPath, file))) continue
      try {
        await writeFileAtomic(target, text, { exclusive: true })
      } catch (error) {
        // Created between the check and the write: try the next name
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue
        throw error
      }
      return { success: true, file }
    }
    return fail(NOT_PASTED)
  } catch (error) {
    safeError('Could not paste the test file:', error)
    return fail(NOT_PASTED)
  }
}

/** Moves `target` to the OS Trash after checking it really is inside the project. */
async function trashInside(projectPath: string, target: string): Promise<boolean> {
  await assertRealInside(projectPath, target)
  const stat = await lstatOrNull(target)
  if (!stat) return false
  if (!stat.isFile() && !stat.isSymbolicLink()) throw new Error(`Not a file: ${target}`)
  await shell.trashItem(target)
  return true
}

/**
 * 'trash-test': moves a spec file of the open project, and its record when it was recorded,
 * to the OS Trash (never a deletion), then forgets the recorded test and tells the renderer.
 */
export async function trashTest(
  projectPath: unknown,
  fileRel: unknown
): Promise<{ success: true; testId?: string } | Fail> {
  try {
    const project = await openProject(projectPath)
    if ('error' in project) return project
    if (!isSpecRel(fileRel)) return fail(NOT_FOUND)
    const root = project.projectPath
    const target = resolveInside(root, fileRel)
    const record = await readSidecar(root, fileRel).catch(() => null)
    const testId = record && record.file === fileRel ? record.id : undefined
    const tests = appState.tests

    const found = await inTestQueue(root, testId ?? `\0file\0${fileRel}`, async () => {
      const file = await trashInside(root, target)
      const sidecar = await trashInside(root, sidecarPath(root, fileRel))
      return file || sidecar
    })
    if (!found) return fail(NOT_FOUND)

    // Before replying: an open copy of the test then knows it is gone and won't save it back
    if (appState.projectPath === root && appState.tests === tests) {
      for (const [id, test] of tests) if (id === testId || test.file === fileRel) tests.delete(id)
      appState.mainWindow?.webContents.send('tests-updated', Array.from(tests.values()))
    }
    return testId ? { success: true, testId } : { success: true }
  } catch (error) {
    safeError('Could not move the test to the Trash:', error)
    return fail(NOT_TRASHED)
  }
}
