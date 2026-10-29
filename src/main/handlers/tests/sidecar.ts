import fs from 'fs/promises'
import { randomBytes } from 'crypto'
import { dirname, isAbsolute, join, relative, resolve } from 'path'
import { isStep } from '../../../shared/types/step'
import { refusedSecretName, withSecretNames } from '../../../shared/secretSteps'
import type { Sidecar } from '../../../shared/types/projectTest'

export class SidecarUnreadableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SidecarUnreadableError'
  }
}

const testsDir = (projectPath: string): string => join(projectPath, '.raider', 'tests')

/** True for a relative POSIX path with no empty, `.` or `..` segments. */
export function isSafeRelPath(rel: unknown): rel is string {
  if (typeof rel !== 'string' || rel === '' || rel.includes('\\') || rel.includes('\0'))
    return false
  if (rel.startsWith('/') || /^[A-Za-z]:/.test(rel)) return false
  return rel.split('/').every((part) => part !== '' && part !== '.' && part !== '..')
}

/** Joins `rel` onto `root`, throwing unless the result stays strictly inside `root`. */
export function resolveInside(root: string, rel: string): string {
  if (!isSafeRelPath(rel)) throw new Error(`Unsafe path: ${rel}`)
  const target = resolve(root, rel)
  const fromRoot = relative(resolve(root), target)
  if (fromRoot === '' || fromRoot.startsWith('..') || isAbsolute(fromRoot))
    throw new Error(`Path escapes its folder: ${rel}`)
  return target
}

const isInside = (root: string, target: string): boolean => {
  const rel = relative(root, target)
  return !rel.startsWith('..') && !isAbsolute(rel)
}

/**
 * Throws unless `target` really lives inside the project once symlinks are
 * followed: the nearest existing ancestor (or the target itself) is resolved
 * with realpath and compared to the project's realpath. A dangling symlink on
 * the way is refused, since a write would follow it somewhere unknown.
 */
export async function assertRealInside(projectPath: string, target: string): Promise<void> {
  const realProject = await fs.realpath(projectPath)
  let current = resolve(target)
  let retries = 0
  for (;;) {
    try {
      const real = await fs.realpath(current)
      if (!isInside(realProject, real)) throw new Error(`Path leaves the project: ${target}`)
      return
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      // realpath also says ENOENT for a dangling symlink, which lstat still sees.
      // Anything else lstat finds was created meanwhile (a parallel save): look again.
      const stat = await fs.lstat(current).catch(() => null)
      if (stat?.isSymbolicLink()) throw new Error(`Path goes through a broken link: ${target}`)
      if (stat && ++retries <= 10) continue
      if (stat) throw new Error(`Path keeps changing: ${target}`)
      const parent = dirname(current)
      if (parent === current) throw new Error(`Path leaves the project: ${target}`)
      current = parent
    }
  }
}

// Hard links are unavailable on e.g. exFAT, FAT32 and some network shares
const NO_LINK = ['ENOTSUP', 'EOPNOTSUPP', 'EPERM', 'EXDEV', 'ENOSYS']

// Creates `target` only if it doesn't exist ('wx'); removes it again if the write fails
async function createExclusive(target: string, body: string): Promise<void> {
  const handle = await fs.open(target, 'wx')
  try {
    await handle.writeFile(body, 'utf-8')
  } catch (error) {
    await handle.close().catch(() => undefined)
    await fs.unlink(target).catch(() => undefined)
    throw error
  }
  await handle.close()
}

/**
 * Writes via a unique tmp file. `exclusive` never replaces an existing file
 * (hard link fails with EEXIST; without hard links it falls back to an
 * exclusive create); otherwise the tmp file is renamed over it.
 */
export async function writeFileAtomic(
  target: string,
  body: string,
  { exclusive = false }: { exclusive?: boolean } = {}
): Promise<void> {
  const tmp = `${target}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`
  try {
    await fs.writeFile(tmp, body, 'utf-8')
    if (!exclusive) await fs.rename(tmp, target)
    else {
      try {
        await fs.link(tmp, target)
      } catch (error) {
        if (!NO_LINK.includes((error as NodeJS.ErrnoException).code ?? '')) throw error
        await createExclusive(target, body)
      }
    }
  } finally {
    await fs.unlink(tmp).catch(() => undefined)
  }
}

/** Chains `task` after earlier tasks with the same key; a failure doesn't block later ones. */
export function serialize<T>(
  queues: Map<string, Promise<unknown>>,
  key: string,
  task: () => Promise<T>
): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve()
  const run = previous.then(task)
  const settled = run.catch(() => undefined)
  queues.set(key, settled)
  // Drop the entry once idle so the map doesn't grow with every test id
  void settled.then(() => {
    if (queues.get(key) === settled) queues.delete(key)
  })
  return run
}

export function sidecarPath(projectPath: string, fileRel: string): string {
  return resolveInside(testsDir(projectPath), `${fileRel}.json`)
}

const isStr = (v: unknown): v is string => typeof v === 'string'

function isSidecar(value: unknown): value is Sidecar {
  if (typeof value !== 'object' || value === null) return false
  const s = value as Record<string, unknown>
  return (
    s.version === 1 &&
    [s.id, s.name, s.url, s.file, s.hash, s.createdAt, s.updatedAt].every(isStr) &&
    (s.automation === 'selenium' || s.automation === 'watir') &&
    (s.codeOwned === undefined || s.codeOwned === true) &&
    Array.isArray(s.steps) &&
    s.steps.every(isStep)
  )
}

/** Null when there is no sidecar; throws SidecarUnreadableError for bad JSON or shape. */
export async function readSidecar(projectPath: string, fileRel: string): Promise<Sidecar | null> {
  let raw: string
  try {
    raw = await fs.readFile(sidecarPath(projectPath, fileRel), 'utf-8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new SidecarUnreadableError(`Sidecar is not valid JSON: ${fileRel}`)
  }
  const steps = (parsed as { steps?: unknown }).steps
  const refused = Array.isArray(steps)
    ? steps.map(refusedSecretName).find((name) => name !== undefined)
    : undefined
  if (refused !== undefined) {
    throw new SidecarUnreadableError(
      `Sidecar ${fileRel} has a password step that reads ${refused}. Only RAIDER_SECRET_ variables are allowed.`
    )
  }
  if (!isSidecar(parsed)) throw new SidecarUnreadableError(`Sidecar has a bad shape: ${fileRel}`)
  // Secret steps saved before names were stored are named once here; the next save keeps them
  return { ...parsed, steps: withSecretNames(parsed.steps) }
}

// Writes and deletes per sidecar path are chained so they can't interleave or reorder
const sidecarQueues = new Map<string, Promise<unknown>>()

export async function writeSidecar(projectPath: string, sidecar: Sidecar): Promise<void> {
  const file = sidecarPath(projectPath, sidecar.file)
  // Serialize now so later in-memory mutations don't leak into this write
  const body = JSON.stringify(sidecar, null, 2)
  return serialize(sidecarQueues, file, async () => {
    await assertRealInside(projectPath, file)
    await fs.mkdir(dirname(file), { recursive: true })
    await writeFileAtomic(file, body)
  })
}

export async function deleteSidecar(projectPath: string, fileRel: string): Promise<void> {
  const file = sidecarPath(projectPath, fileRel)
  return serialize(sidecarQueues, file, async () => {
    await assertRealInside(projectPath, file)
    try {
      await fs.unlink(file)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  })
}

// Symlinked directories are not followed (Dirent.isDirectory is false for them)
async function findJsonFiles(dir: string, prefix: string): Promise<string[]> {
  const out: string[] = []
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) out.push(...(await findJsonFiles(join(dir, entry.name), rel)))
    else if (entry.isFile() && entry.name.endsWith('.json')) out.push(rel)
  }
  return out
}

export async function listSidecars(
  projectPath: string
): Promise<{ fileRel: string; sidecar: Sidecar | null; error?: string }[]> {
  const dir = testsDir(projectPath)
  let files: string[]
  try {
    // A .raider/tests that resolves outside the project is not ours to read
    await assertRealInside(projectPath, dir)
    files = await findJsonFiles(dir, '')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
  const entries = await Promise.all(
    files.sort().map(async (jsonRel) => {
      const fileRel = jsonRel.slice(0, -'.json'.length)
      try {
        return { fileRel, sidecar: await readSidecar(projectPath, fileRel) }
      } catch (error) {
        return { fileRel, sidecar: null, error: (error as Error).message }
      }
    })
  )
  return entries
}
