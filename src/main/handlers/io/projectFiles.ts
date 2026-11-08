/**
 * File operations of the Files tab's context menu: new file, new folder, paste (copy),
 * duplicate, rename and move to Trash.
 *
 * The renderer only ever sends project-relative POSIX paths and plain names; every path is
 * resolved against the active project (appState.projectPath) and checked, symlinks
 * included, before anything changes. Nothing here overwrites or deletes: new entries are
 * created exclusively and Delete moves the entry to the OS Trash.
 */
import fs from 'fs/promises'
import { constants } from 'fs'
import type { Stats } from 'fs'
import { basename, dirname, extname, join, posix, relative, sep } from 'path'
import { shell } from 'electron'
import { appState } from '../appState'
import { activationSettled } from '../project/setActiveProject'
import { assertRealInside, listSidecars, resolveInside } from '../tests/sidecar'
import { PROJECT_CHANGED_ERROR } from '../tests/recordedStore'
import { RECORDED_MARKER } from '../../codegen/testFile'
import { entryNameIssue, isProtectedName, isReachableSegment } from '../../../shared/entryName'
import { safeError } from '../../utils/safeLog'
import type { ProjectFileErrorCode, ProjectFileResult } from '../../../shared/types/projectFiles'

export type EntryKind = 'file' | 'folder'

/** Test hooks only: the IPC handlers always use the defaults. */
export type CopyLimits = { maxEntries?: number; maxBytes?: number }

class FileOpError extends Error {
  constructor(
    message: string,
    readonly code?: ProjectFileErrorCode
  ) {
    super(message)
  }
}

// How many `_copyN` names to try before giving up
const MAX_COPY_NAMES = 1000
// A copy is refused up front beyond this many entries or bytes
const MAX_COPY_ENTRIES = 5000
const MAX_COPY_BYTES = 200 * 1024 * 1024
const SPEC_SUFFIX = '_spec.rb'
const RECORDED_ERROR = 'This is a recorded test. Rename or delete it from the Tests tab.'

/** A single path segment that is safe on every OS and not Git's or Raider's own folder. */
export const isSafeName = (name: unknown): name is string => entryNameIssue(name) === null

/**
 * The open project, but only when it is the one the renderer is working on: a request
 * that was in flight during a project switch must never land in the other project.
 */
async function openProject(projectPath: unknown): Promise<string> {
  await activationSettled()
  const root = appState.projectPath
  if (!root) throw new Error('No project is open.')
  if (projectPath !== root) throw new FileOpError(PROJECT_CHANGED_ERROR, 'projectChanged')
  return root
}

const toRel = (root: string, abs: string): string => relative(root, abs).split(sep).join('/')

/**
 * Joins an existing `rel` onto the project. Its segments only have to be reachable (odd
 * names made elsewhere stay renamable); new names go through the full rule instead.
 */
function resolveRel(root: string, rel: string): string {
  if (!rel.split('/').every(isReachableSegment))
    throw new Error(`Not a usable project path: ${rel}`)
  return resolveInside(root, rel)
}

/**
 * Where `abs` really is, relative to the project's real folder, in POSIX form: links on the
 * way are followed, the last segment only with `followLeaf`.
 */
async function realRelOf(root: string, abs: string, followLeaf: boolean): Promise<string> {
  const realRoot = await fs.realpath(root)
  const real = followLeaf
    ? await fs.realpath(abs)
    : join(await fs.realpath(dirname(abs)), basename(abs))
  return relative(realRoot, real).split(sep).join('/')
}

/** Git's and Raider's folders are off limits, also when a link with another name leads there. */
function assertNotProtected(realRel: string): void {
  if (realRel !== '' && realRel.split('/').some(isProtectedName))
    throw new Error('Git and Raider folders cannot be changed from Files')
}

/** A folder to write into: the project root for '', else a real folder inside the project. */
async function folderAt(root: string, rel: unknown): Promise<{ dir: string; realRel: string }> {
  if (typeof rel !== 'string') throw new Error('Not a folder path')
  const dir = rel === '' ? root : resolveRel(root, rel)
  await assertRealInside(root, dir)
  if (!(await fs.stat(dir)).isDirectory()) throw new Error(`Not a folder: ${rel}`)
  const realRel = await realRelOf(root, dir, true)
  assertNotProtected(realRel)
  return { dir, realRel }
}

/**
 * An existing entry inside the project, never the root itself. Its folder must really be
 * inside the project; the entry itself is not followed (a link is the link).
 */
async function entryAt(
  root: string,
  rel: unknown
): Promise<{ abs: string; stat: Stats; realRel: string }> {
  if (typeof rel !== 'string') throw new Error('Not a project path')
  const abs = resolveRel(root, rel)
  await assertRealInside(root, dirname(abs))
  const stat = await fs.lstat(abs)
  const realRel = await realRelOf(root, abs, false)
  assertNotProtected(realRel)
  return { abs, stat, realRel }
}

const childRel = (dirRel: string, name: string): string => (dirRel ? `${dirRel}/${name}` : name)

/** The recorded tests' spec paths, lower case (macOS and Windows disks ignore case). */
const recordedRels = async (root: string): Promise<string[]> =>
  (await listSidecars(root)).map(({ fileRel }) => fileRel.toLowerCase())

/** True when `realRel` is a recorded spec or a folder holding one. */
const holdsRecorded = (recorded: string[], realRel: string): boolean => {
  const entry = realRel.toLowerCase()
  return recorded.some((file) => file === entry || file.startsWith(entry + '/'))
}

/**
 * Refuses a recorded spec, or a folder holding one: moving it from Files would leave its
 * record in .raider/tests behind. Compared on the entry's real place in the project.
 */
async function assertNotRecorded(root: string, realRel: string): Promise<void> {
  if (holdsRecorded(await recordedRels(root), realRel))
    throw new FileOpError(RECORDED_ERROR, 'recorded')
}

/**
 * A new entry must not land where a recorded test's file is missing (or inside a folder
 * whose recorded files are missing): it would quietly become that test.
 */
async function assertFreeOfRecords(root: string, realRel: string): Promise<void> {
  if (holdsRecorded(await recordedRels(root), realRel))
    throw new FileOpError('A recorded test uses that name', 'exists')
}

const isExists = (error: unknown): boolean => (error as NodeJS.ErrnoException).code === 'EEXIST'

const isSpecName = (name: string): boolean =>
  name.endsWith(SPEC_SUFFIX) && name.length > SPEC_SUFFIX.length

/**
 * `base_copy.ext`, `base_copy2.ext`, … as Duplicate always named them; folders keep dots.
 * A spec stays a spec: `login_copy_spec.rb`, `login_copy_2_spec.rb`, …
 */
function copyName(name: string, isFolder: boolean, n: number): string {
  if (!isFolder && isSpecName(name)) {
    return `${name.slice(0, -SPEC_SUFFIX.length)}_copy${n === 1 ? '' : `_${n}`}${SPEC_SUFFIX}`
  }
  const ext = isFolder ? '' : extname(name)
  const base = ext ? name.slice(0, -ext.length) : name
  return `${base}_copy${n === 1 ? '' : n}${ext}`
}

/** The line of Raider's recorded marker in the spec's header (its leading comments), or -1. */
function headerMarkerLine(lines: string[]): number {
  for (const [i, line] of lines.entries()) {
    const text = line.trim()
    if (text.startsWith(RECORDED_MARKER)) return i
    if (text !== '' && !text.startsWith('#')) return -1
  }
  return -1
}

/**
 * Copies one file exclusively (EEXIST when `dest` is taken). A copied spec loses Raider's
 * recorded marker: without its record the copy is a plain code test, and says so. Only
 * the header's marker goes; the same words further down are the test's own text.
 */
async function copyFileTo(src: string, stat: Stats, dest: string): Promise<void> {
  if (isSpecName(basename(src))) {
    const text = await fs.readFile(src, 'utf-8')
    const lines = text.split('\n')
    const marker = headerMarkerLine(lines)
    if (marker >= 0) {
      const kept = lines.filter((_, i) => i !== marker)
      const handle = await fs.open(dest, 'wx', stat.mode & 0o777)
      try {
        await handle.writeFile(kept.join('\n'), 'utf-8')
      } finally {
        await handle.close()
      }
      return
    }
  }
  await fs.copyFile(src, dest, constants.COPYFILE_EXCL)
}

/** Refuses a copy over the limits before anything is written; links are not counted. */
async function assertCopySize(src: string, stat: Stats, limits: CopyLimits): Promise<void> {
  const maxEntries = limits.maxEntries ?? MAX_COPY_ENTRIES
  const maxBytes = limits.maxBytes ?? MAX_COPY_BYTES
  let entries = 0
  let bytes = 0
  const visit = async (path: string, info: Stats): Promise<void> => {
    if (!info.isFile() && !info.isDirectory()) return
    if (path !== src && !isSafeName(basename(path))) return
    entries++
    bytes += info.isFile() ? info.size : 0
    if (entries > maxEntries || bytes > maxBytes)
      throw new FileOpError(
        `Too big to copy here (over ${maxEntries} items or ${Math.round(maxBytes / 1048576)} MB). Copy it in Finder or Explorer instead.`,
        'tooLarge'
      )
    if (info.isDirectory()) {
      for (const entry of await fs.readdir(path)) {
        const child = join(path, entry)
        await visit(child, await fs.lstat(child))
      }
    }
  }
  await visit(src, stat)
}

/**
 * Copies `src` (a real file or folder) into `destDir` under the first free name: `name`
 * itself when `tryOwnName`, then the copy names. Each try creates the leaf exclusively,
 * so nothing is ever overwritten. Returns the new path and how many links (or other
 * special entries) inside a folder were skipped.
 */
async function copyInto(
  root: string,
  src: string,
  stat: Stats,
  destDir: { dir: string; realRel: string },
  tryOwnName: boolean
): Promise<{ dest: string; skipped: number }> {
  const name = basename(src)
  // The copy's own name follows the rule for new names
  if (!isSafeName(name)) throw new FileOpError('That name cannot be used', 'invalidName')
  const isFolder = stat.isDirectory()
  const recorded = await recordedRels(root)
  for (let n = tryOwnName ? 0 : 1; n <= MAX_COPY_NAMES; n++) {
    const leaf = n === 0 ? name : copyName(name, isFolder, n)
    // A recorded test's path (its file missing) counts as taken
    if (holdsRecorded(recorded, childRel(destDir.realRel, leaf))) continue
    const dest = join(destDir.dir, leaf)
    try {
      if (isFolder) await fs.mkdir(dest)
      else await copyFileTo(src, stat, dest)
    } catch (error) {
      if (isExists(error)) continue
      throw error
    }
    const skipped = isFolder ? await copyFolderContents(root, src, dest) : 0
    return { dest, skipped }
  }
  throw new FileOpError(`No free name for a copy of ${name}`, 'exists')
}

/**
 * Copies the contents of `srcDir` into the new, empty `destDir`. Symlinks are never
 * followed nor recreated (wherever they point) and neither are sockets, FIFOs or devices:
 * they are skipped and counted. Every entry is checked to stay inside the project.
 * Residual risk: an entry swapped for a link between its lstat and its copy is followed
 * once; that takes a local process racing this copy inside the project.
 */
async function copyFolderContents(root: string, srcDir: string, destDir: string): Promise<number> {
  let skipped = 0
  for (const entry of await fs.readdir(srcDir)) {
    const src = join(srcDir, entry)
    const dest = join(destDir, entry)
    const stat = await fs.lstat(src)
    // Links, special files and names other systems refuse (macOS's `Icon\r`) stay behind
    if ((!stat.isFile() && !stat.isDirectory()) || !isSafeName(entry)) {
      skipped++
      continue
    }
    await assertRealInside(root, src)
    await assertRealInside(root, dest)
    if (stat.isDirectory()) {
      await fs.mkdir(dest)
      skipped += await copyFolderContents(root, src, dest)
    } else {
      await copyFileTo(src, stat, dest)
    }
  }
  return skipped
}

/** The source of a copy: a real file or folder inside the project, not a link. */
async function copySource(
  root: string,
  rel: unknown,
  limits: CopyLimits
): Promise<{ abs: string; stat: Stats; realRel: string }> {
  const entry = await entryAt(root, rel)
  if (entry.stat.isSymbolicLink()) throw new Error('Links cannot be copied')
  if (!entry.stat.isFile() && !entry.stat.isDirectory())
    throw new Error('Only files and folders can be copied')
  await assertRealInside(root, entry.abs)
  await assertCopySize(entry.abs, entry.stat, limits)
  return entry
}

async function run(
  label: string,
  task: () => Promise<ProjectFileResult>
): Promise<ProjectFileResult> {
  try {
    return await task()
  } catch (error) {
    if (error instanceof FileOpError) {
      return { success: false, error: error.message, ...(error.code && { code: error.code }) }
    }
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'EEXIST') return { success: false, error: 'That name is taken', code: 'exists' }
    if (code === 'ENOENT') return { success: false, error: 'Not found', code: 'notFound' }
    safeError(`Error during ${label}:`, error)
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

const invalidName = (): ProjectFileResult => ({
  success: false,
  error: 'That name cannot be used',
  code: 'invalidName'
})

/** 'project-file-create': an empty file or folder named `name` in `parentRel` ('' = root). */
export function createProjectEntry(
  projectPath: string,
  parentRel: string,
  name: string,
  kind: EntryKind
): Promise<ProjectFileResult> {
  return run('create', async () => {
    if (kind !== 'file' && kind !== 'folder') throw new Error('Unknown kind')
    if (!isSafeName(name)) return invalidName()
    const root = await openProject(projectPath)
    const { dir, realRel } = await folderAt(root, parentRel)
    const target = join(dir, name)
    await assertFreeOfRecords(root, childRel(realRel, name))
    // Both create only the leaf and fail with EEXIST on anything there, a link included
    if (kind === 'folder') await fs.mkdir(target)
    else await (await fs.open(target, 'wx')).close()
    return { success: true, path: toRel(root, target) }
  })
}

/**
 * For `raider g <type> <name> --path <folderRel>`: checks the folder as New file does (a real
 * folder inside the open project, not the root, not Git's or Raider's) and that nothing is at
 * `fileName` in it yet, since the gem overwrites without asking when no one can answer.
 * Returns the file's project-relative path; creates nothing.
 */
export function scaffoldTarget(
  projectPath: string,
  folderRel: string,
  fileName: string
): Promise<ProjectFileResult> {
  return run('scaffold', async () => {
    if (!isSafeName(fileName)) return invalidName()
    const root = await openProject(projectPath)
    if (folderRel === '') throw new Error('Pick a folder inside the project')
    const { dir, realRel } = await folderAt(root, folderRel)
    const target = join(dir, fileName)
    const rel = toRel(root, target)
    // Anything there counts, a dangling link included
    if (await fs.lstat(target).catch(() => null))
      throw new FileOpError(`${rel} already exists`, 'exists')
    await assertFreeOfRecords(root, childRel(realRel, fileName))
    return { success: true, path: rel }
  })
}

/** 'project-file-copy': pastes `srcRel` into `destParentRel` ('' = root), recursively. */
export function copyProjectEntry(
  projectPath: string,
  srcRel: string,
  destParentRel: string,
  limits: CopyLimits = {}
): Promise<ProjectFileResult> {
  return run('copy', async () => {
    const root = await openProject(projectPath)
    const src = await copySource(root, srcRel, limits)
    const destDir = await folderAt(root, destParentRel)
    if (src.stat.isDirectory()) {
      const [realSrc, realDest] = await Promise.all([
        fs.realpath(src.abs),
        fs.realpath(destDir.dir)
      ])
      if (realDest === realSrc || realDest.startsWith(realSrc + sep))
        throw new FileOpError('A folder cannot be pasted into itself', 'intoItself')
    }
    const { dest, skipped } = await copyInto(root, src.abs, src.stat, destDir, true)
    return { success: true, path: toRel(root, dest), skipped }
  })
}

/** 'project-file-duplicate': a copy next to `rel`, named `name_copy`, `name_copy2`, … */
export function duplicateProjectEntry(
  projectPath: string,
  rel: string,
  limits: CopyLimits = {}
): Promise<ProjectFileResult> {
  return run('duplicate', async () => {
    const root = await openProject(projectPath)
    const src = await copySource(root, rel, limits)
    const parent = { dir: dirname(src.abs), realRel: posix.dirname(src.realRel) }
    if (parent.realRel === '.') parent.realRel = ''
    const { dest, skipped } = await copyInto(root, src.abs, src.stat, parent, false)
    return { success: true, path: toRel(root, dest), skipped }
  })
}

/** 'project-file-rename': renames `rel` within its folder; never replaces another entry. */
export function renameProjectEntry(
  projectPath: string,
  rel: string,
  name: string
): Promise<ProjectFileResult> {
  return run('rename', async () => {
    if (!isSafeName(name)) return invalidName()
    const root = await openProject(projectPath)
    const { abs, stat, realRel } = await entryAt(root, rel)
    await assertNotRecorded(root, realRel)
    const target = join(dirname(abs), name)
    if (target === abs) return { success: true, path: toRel(root, abs) }
    const parentRel = posix.dirname(realRel)
    const targetRel = childRel(parentRel === '.' ? '' : parentRel, name)
    // A case-only rename stays on the entry's own record path, which it doesn't hold
    if (targetRel.toLowerCase() !== realRel.toLowerCase())
      await assertFreeOfRecords(root, targetRel)
    // Looked up right before the rename. rename() itself replaces an existing file and there
    // is no portable no-replace rename (linking then unlinking would delete), so an entry
    // created at `target` in the instant between the two calls could still be replaced.
    const existing = await fs.lstat(target).catch(() => null)
    // The same entry under another case (a case-insensitive disk) is a case change, not a clash
    const sameEntry = existing && existing.ino === stat.ino && existing.dev === stat.dev
    if (existing && !sameEntry) throw new FileOpError('That name is taken', 'exists')
    await fs.rename(abs, target)
    return { success: true, path: toRel(root, target) }
  })
}

/** 'project-file-trash': moves `rel` to the OS Trash (a link goes, not what it points to). */
export function trashProjectEntry(projectPath: string, rel: string): Promise<ProjectFileResult> {
  return run('trash', async () => {
    const root = await openProject(projectPath)
    const { abs, realRel } = await entryAt(root, rel)
    await assertNotRecorded(root, realRel)
    await shell.trashItem(abs)
    return { success: true }
  })
}
