import fs from 'fs/promises'
import { constants, type Stats } from 'fs'
import { dirname, posix } from 'path'
import { shell } from 'electron'
import { appState } from '../appState'
import { activationSettled } from '../project/setActiveProject'
import deleteTrace from '../trace/deleteTrace'
import { NO_PROJECT_ERROR, PROJECT_CHANGED_ERROR } from './recordedStore'
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
import type { Sidecar } from '../../../shared/types/projectTest'

/**
 * The Tests list's Copy, Paste, Duplicate and Delete on spec files. The renderer only ever
 * names project-relative `*_spec.rb` paths; everything is resolved, checked and done here.
 * Files are never deleted: Delete (and Undo) move them to the OS Trash.
 */

/** The largest spec file these handlers read or write */
export const MAX_TEST_FILE_BYTES = 1024 * 1024
const MAX_SUFFIX = 1000
const MAX_NAME_LENGTH = 300
// The trace ids saveTrace accepts (its SAFE_TEST_ID)
const SAFE_TEST_ID = /^[A-Za-z0-9_-]+$/

const NOT_FOUND = 'This test could not be found.'
const NOT_READ = 'This test could not be read.'
const NOT_PASTED = 'This test could not be pasted.'
const NOT_TRASHED = 'This test could not be moved to the Trash.'
const TOO_BIG = 'This test file is too big to copy.'

type Fail = { success: false; error: string }
const fail = (error: string): Fail => ({ success: false, error })

interface OpenProject {
  projectPath: string
  layout: ProjectLayout
}

/** The open project, but only when it is the one the renderer says it is working on. */
async function openProject(projectPath: unknown): Promise<OpenProject | Fail> {
  await activationSettled()
  const { projectPath: active, layout } = appState
  if (!active || !layout) return fail(NO_PROJECT_ERROR)
  if (projectPath !== active) return fail(PROJECT_CHANGED_ERROR)
  return { projectPath: active, layout }
}

// lstat, so a broken symlink counts as there too
const lstatOrNull = (p: string): Promise<Stats | null> =>
  fs.lstat(p).catch((e: NodeJS.ErrnoException) => {
    if (e.code === 'ENOENT') return null
    throw e
  })

const isUnder = (rel: string, root: string): boolean => rel === root || rel.startsWith(`${root}/`)

/** The record stored for `fileRel` when it really is that file's record; else null. */
const recordOf = async (projectPath: string, fileRel: string): Promise<Sidecar | null> => {
  const record = await readSidecar(projectPath, fileRel).catch(() => null)
  return record && record.file === fileRel ? record : null
}

/**
 * Only spec files of the test list: under the spec folder, or a recorded test's own file
 * (its record vouches for it, e.g. after spec_path moved).
 */
const isListedSpec = (project: OpenProject, fileRel: string, record: Sidecar | null): boolean =>
  isUnder(fileRel, specRoot(project.layout)) || record !== null

// Never follows a link at the file itself; non-blocking so a FIFO can't hang the open
const READ_FLAGS = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0)

/** 'read-test-file': the text of a spec file of the open project, for Copy. */
export async function readTestFile(
  projectPath: unknown,
  fileRel: unknown
): Promise<{ success: true; text: string } | Fail> {
  try {
    const project = await openProject(projectPath)
    if ('error' in project) return project
    if (!isSpecRel(fileRel)) return fail(NOT_FOUND)
    const record = await recordOf(project.projectPath, fileRel)
    if (!isListedSpec(project, fileRel, record)) return fail(NOT_FOUND)
    const target = resolveInside(project.projectPath, fileRel)
    await assertRealInside(project.projectPath, target)
    if (!(await lstatOrNull(target))?.isFile()) return fail(NOT_FOUND)

    const handle = await fs.open(target, READ_FLAGS)
    try {
      // The opened file itself, whatever happened to the path since the checks
      if (!(await handle.stat()).isFile()) return fail(NOT_FOUND)
      const buffer = Buffer.alloc(MAX_TEST_FILE_BYTES + 1)
      let total = 0
      while (total < buffer.length) {
        const { bytesRead } = await handle.read(buffer, total, buffer.length - total, total)
        if (bytesRead === 0) break
        total += bytesRead
      }
      if (total > MAX_TEST_FILE_BYTES) return fail(TOO_BIG)
      return { success: true, text: buffer.toString('utf-8', 0, total) }
    } finally {
      await handle.close()
    }
  } catch (error) {
    safeError('Could not read the test file:', error)
    return fail(NOT_READ)
  }
}

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

const TOP_DESCRIBE = /^(?:RSpec\.)?describe\b/
const SIMPLE_DESCRIBE = /^((?:RSpec\.)?describe\s*\(?\s*)(?:'([^'\\\n]*)'|"([^"\\#\n]*)")/

/**
 * `text` with the string of its first top-level describe (one at the start of a line) set to
 * `name`. Only a plain single- or double-quoted string, with no escapes or interpolation, is
 * changed, and only to a name that fits in the same quotes as plain text; else null.
 */
export function renameTopDescribe(text: string, name: string): string | null {
  const lines = text.split('\n')
  const index = lines.findIndex((line) => TOP_DESCRIBE.test(line))
  if (index < 0) return null
  const match = SIMPLE_DESCRIBE.exec(lines[index])
  if (!match) return null
  const single = match[2] !== undefined
  const fits = single ? !/['\\]/.test(name) : !/["\\#]/.test(name)
  if (!fits) return null
  const quoted = single ? `'${name}'` : `"${name}"`
  lines[index] = match[1] + quoted + lines[index].slice(match[0].length)
  return lines.join('\n')
}

const isUsableName = (name: unknown): name is string =>
  typeof name === 'string' &&
  name.trim() !== '' &&
  name.length <= MAX_NAME_LENGTH &&
  // eslint-disable-next-line no-control-regex
  !/[\u0000-\u001f\u007f]/.test(name)

/**
 * 'paste-test-file': writes `text` as a new `<base>_copy[_n]_spec.rb`, next to `nearFile`
 * (the selected row), else in the copied file's folder if this project has it, else in the
 * spec folder. Never replaces a file. With `name`, the first top-level describe takes it when
 * it is a plain string (`renamed` says whether it did). Returns the new file's path.
 */
export async function pasteTestFile(
  projectPath: unknown,
  payload: unknown
): Promise<{ success: true; file: string; renamed: boolean } | Fail> {
  try {
    const project = await openProject(projectPath)
    if ('error' in project) return project
    if (typeof payload !== 'object' || payload === null) return fail(NOT_PASTED)
    const { text, sourceFile, nearFile, name } = payload as Record<string, unknown>
    if (typeof text !== 'string') return fail(NOT_PASTED)
    if (Buffer.byteLength(text, 'utf-8') > MAX_TEST_FILE_BYTES) return fail(TOO_BIG)
    if (!isSpecRel(sourceFile)) return fail(NOT_PASTED)
    const renamedText = isUsableName(name) ? renameTopDescribe(text, name) : null
    const body = renamedText ?? text
    if (Buffer.byteLength(body, 'utf-8') > MAX_TEST_FILE_BYTES) return fail(TOO_BIG)

    const root = specRoot(project.layout)
    const folder =
      (await existingSpecFolder(project.projectPath, root, nearFile)) ??
      (await existingSpecFolder(project.projectPath, root, sourceFile)) ??
      root
    const folderAbs = resolveInside(project.projectPath, folder)
    await assertRealInside(project.projectPath, folderAbs)
    await fs.mkdir(folderAbs, { recursive: true })
    await assertRealInside(project.projectPath, folderAbs)
    const folderReal = await fs.realpath(folderAbs)

    const base = posix.basename(sourceFile).slice(0, -'_spec.rb'.length)
    for (let n = 1; n <= MAX_SUFFIX; n++) {
      const fileName = n === 1 ? `${base}_copy_spec.rb` : `${base}_copy_${n}_spec.rb`
      const file = posix.join(folder, fileName)
      const target = resolveInside(folderAbs, fileName)
      // A stale record for the name would make the new file look recorded
      if (await lstatOrNull(target)) continue
      if (await lstatOrNull(sidecarPath(project.projectPath, file))) continue
      // The folder must still be the one checked above. A swap after this line remains
      // possible (there is no handle-based create here), but the window is a few syscalls
      if ((await fs.realpath(folderAbs)) !== folderReal) return fail(NOT_PASTED)
      try {
        await writeFileAtomic(target, body, { exclusive: true })
      } catch (error) {
        // Created between the check and the write: try the next name
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue
        throw error
      }
      return { success: true, file, renamed: renamedText !== null }
    }
    return fail(NOT_PASTED)
  } catch (error) {
    safeError('Could not paste the test file:', error)
    return fail(NOT_PASTED)
  }
}

/** A file that may go to the Trash, as it was when checked. */
interface Checked {
  target: string
  realParent: string
  dev: number
  ino: number
}

/**
 * Null when `target` is absent. Throws unless it is a regular file (never a link) really
 * inside the project.
 */
async function checkTrashable(projectPath: string, target: string): Promise<Checked | null> {
  await assertRealInside(projectPath, target)
  const stat = await lstatOrNull(target)
  if (!stat) return null
  if (!stat.isFile()) throw new Error(`Not a regular file: ${target}`)
  return { target, realParent: await fs.realpath(dirname(target)), dev: stat.dev, ino: stat.ino }
}

/**
 * Moves a checked file to the Trash if its folder still resolves to the same place and it is
 * still the same file. shell.trashItem takes a path, so a swap between this re-check and the
 * call remains possible; the re-check narrows that window to a single call.
 */
async function trashChecked(checked: Checked): Promise<void> {
  if ((await fs.realpath(dirname(checked.target))) !== checked.realParent)
    throw new Error(`Folder changed: ${checked.target}`)
  const stat = await fs.lstat(checked.target)
  if (!stat.isFile() || stat.dev !== checked.dev || stat.ino !== checked.ino)
    throw new Error(`File changed: ${checked.target}`)
  await shell.trashItem(checked.target)
}

/**
 * 'trash-test': moves a spec file of the open project, and its record when it was recorded,
 * to the OS Trash (never a deletion). Both are checked before either moves. Then the
 * recorded test is forgotten, the renderer is told, and its trace is deleted like delete-test
 * does. When the file went but its record could not, it is still a success, with `recordLeft`.
 */
export async function trashTest(
  projectPath: unknown,
  fileRel: unknown
): Promise<{ success: true; testId?: string; recordLeft?: true } | Fail> {
  try {
    const project = await openProject(projectPath)
    if ('error' in project) return project
    if (!isSpecRel(fileRel)) return fail(NOT_FOUND)
    const root = project.projectPath
    const record = await recordOf(root, fileRel)
    if (!isListedSpec(project, fileRel, record)) return fail(NOT_FOUND)
    const testId = record?.id
    const target = resolveInside(root, fileRel)
    const tests = appState.tests

    const outcome = await inTestQueue(root, testId ?? `\0file\0${fileRel}`, async () => {
      const spec = await checkTrashable(root, target)
      const sidecar = await checkTrashable(root, sidecarPath(root, fileRel))
      if (!spec && !sidecar) return 'none' as const
      if (spec) await trashChecked(spec)
      if (!sidecar) return 'done' as const
      try {
        await trashChecked(sidecar)
        return 'done' as const
      } catch (error) {
        safeError('Could not move the test record to the Trash:', error)
        return 'specOnly' as const
      }
    })
    if (outcome === 'none') return fail(NOT_FOUND)

    // Before replying: an open copy of the test then knows it is gone and won't save it back
    if (appState.projectPath === root && appState.tests === tests) {
      for (const [id, test] of tests) if (id === testId || test.file === fileRel) tests.delete(id)
      appState.mainWindow?.webContents.send('tests-updated', Array.from(tests.values()))
    }
    if (!testId)
      return outcome === 'specOnly' ? { success: true, recordLeft: true } : { success: true }
    // A record's id is user data: only a plain name may become part of a trace path
    if (SAFE_TEST_ID.test(testId)) void deleteTrace(testId)
    return outcome === 'specOnly'
      ? { success: true, testId, recordLeft: true }
      : { success: true, testId }
  } catch (error) {
    safeError('Could not move the test to the Trash:', error)
    return fail(NOT_TRASHED)
  }
}
