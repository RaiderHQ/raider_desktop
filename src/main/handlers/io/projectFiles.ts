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
import { basename, dirname, extname, join, relative, sep } from 'path'
import { shell } from 'electron'
import { appState } from '../appState'
import { activationSettled } from '../project/setActiveProject'
import { assertRealInside, listSidecars, resolveInside } from '../tests/sidecar'
import { PROJECT_CHANGED_ERROR } from '../tests/recordedStore'
import { RECORDED_MARKER } from '../../codegen/testFile'
import { entryNameIssue } from '../../../shared/entryName'
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

/** Joins `rel` onto the project; every segment must pass the name rule (no .git, .raider…). */
function resolveRel(root: string, rel: string): string {
  if (!rel.split('/').every(isSafeName)) throw new Error(`Not a usable project path: ${rel}`)
  return resolveInside(root, rel)
}

/** A folder to write into: the project root for '', else a real folder inside the project. */
async function folderAt(root: string, rel: unknown): Promise<string> {
  if (typeof rel !== 'string') throw new Error('Not a folder path')
  const dir = rel === '' ? root : resolveRel(root, rel)
  await assertRealInside(root, dir)
  if (!(await fs.stat(dir)).isDirectory()) throw new Error(`Not a folder: ${rel}`)
  return dir
}

/**
 * An existing entry inside the project, never the root itself. Its folder must really be
 * inside the project; the entry itself is not followed (a link is the link).
 */
async function entryAt(root: string, rel: unknown): Promise<{ abs: string; stat: Stats }> {
  if (typeof rel !== 'string') throw new Error('Not a project path')
  const abs = resolveRel(root, rel)
  await assertRealInside(root, dirname(abs))
  return { abs, stat: await fs.lstat(abs) }
}

/**
 * Refuses a recorded spec, or a folder holding one: moving it from Files would leave its
 * record in .raider/tests behind. Compared without case, as macOS and Windows disks do.
 */
async function assertNotRecorded(root: string, rel: string): Promise<void> {
  const entry = rel.toLowerCase()
  for (const { fileRel } of await listSidecars(root)) {
    const file = fileRel.toLowerCase()
    if (file === entry || file.startsWith(entry + '/'))
      throw new FileOpError(RECORDED_ERROR, 'recorded')
  }
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

/**
 * Copies one file exclusively (EEXIST when `dest` is taken). A copied spec loses Raider's
 * recorded marker: without its record the copy is a plain code test, and says so.
 */
async function copyFileTo(src: string, stat: Stats, dest: string): Promise<void> {
  if (isSpecName(basename(src))) {
    const text = await fs.readFile(src, 'utf-8')
    const lines = text.split('\n')
    const kept = lines.filter((line) => !line.trimStart().startsWith(RECORDED_MARKER))
    if (kept.length !== lines.length) {
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
  destDir: string,
  tryOwnName: boolean
): Promise<{ dest: string; skipped: number }> {
  const name = basename(src)
  const isFolder = stat.isDirectory()
  for (let n = tryOwnName ? 0 : 1; n <= MAX_COPY_NAMES; n++) {
    const dest = join(destDir, n === 0 ? name : copyName(name, isFolder, n))
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
    if (!stat.isFile() && !stat.isDirectory()) {
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
): Promise<{ abs: string; stat: Stats }> {
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
    const dir = await folderAt(root, parentRel)
    const target = join(dir, name)
    // Both create only the leaf and fail with EEXIST on anything there, a link included
    if (kind === 'folder') await fs.mkdir(target)
    else await (await fs.open(target, 'wx')).close()
    return { success: true, path: toRel(root, target) }
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
      const [realSrc, realDest] = await Promise.all([fs.realpath(src.abs), fs.realpath(destDir)])
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
    const { dest, skipped } = await copyInto(root, src.abs, src.stat, dirname(src.abs), false)
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
    const { abs, stat } = await entryAt(root, rel)
    await assertNotRecorded(root, rel)
    const target = join(dirname(abs), name)
    if (target === abs) return { success: true, path: toRel(root, abs) }
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
    const { abs } = await entryAt(root, rel)
    await assertNotRecorded(root, rel)
    await shell.trashItem(abs)
    return { success: true }
  })
}
