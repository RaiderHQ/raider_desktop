import fs from 'fs/promises'
import { realpathSync } from 'fs'
import { dirname, posix, resolve } from 'path'
import { generateProjectSpecFile, RECORDED_MARKER } from '../../codegen/testFile'
import { hashRuby } from './codeHash'
import {
  assertRealInside,
  deleteSidecar,
  isSafeRelPath,
  listSidecars,
  resolveInside,
  serialize,
  sidecarPath,
  writeFileAtomic,
  writeSidecar
} from './sidecar'
import type { ProjectLayout } from '../../../shared/types/projectLayout'
import type { Sidecar } from '../../../shared/types/projectTest'
import type { Test } from '../../../shared/types/test'

/** The spec file was edited outside Raider, so Raider must not rewrite or delete it. */
export class CodeOwnedError extends Error {
  constructor(file: string) {
    super(`This test was changed in code and can no longer be edited in Raider: ${file}`)
    this.name = 'CodeOwnedError'
  }
}

const SLUG_MAX = 60
const MAX_SUFFIX = 1000

export function slugify(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/_+$/, '')
  return slug || 'recorded_test'
}

const isSpecRel = (rel: unknown): rel is string => isSafeRelPath(rel) && rel.endsWith('_spec.rb')

// lstat, so a broken symlink counts as taken too
const exists = (p: string): Promise<boolean> =>
  fs.lstat(p).then(
    () => true,
    () => false
  )

async function readIfExists(file: string): Promise<string | null> {
  try {
    return await fs.readFile(file, 'utf-8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

/**
 * The sidecar for `testId`, or null. A sidecar only counts when its `file` is a
 * safe `_spec.rb` path matching where it is stored: its location is its identity.
 */
export async function findSidecarById(
  projectPath: string,
  testId: string
): Promise<Sidecar | null> {
  for (const { fileRel, sidecar } of await listSidecars(projectPath)) {
    if (sidecar?.id === testId && sidecar.file === fileRel && isSpecRel(sidecar.file)) {
      return sidecar
    }
  }
  return null
}

const specRoot = (layout: ProjectLayout): string => {
  const root = posix.normalize(layout.specPath.replace(/\\/g, '/')).replace(/\/+$/, '')
  if (!isSafeRelPath(root)) throw new Error(`Unsafe spec folder: ${layout.specPath}`)
  return root
}

/**
 * Absolute path of an existing recorded test's file. It only has to be a spec
 * file inside the project, so tests stay editable after spec_path changes.
 */
async function recordedFilePath(projectPath: string, fileRel: string): Promise<string> {
  if (!isSpecRel(fileRel)) throw new Error(`Not a spec file: ${fileRel}`)
  const target = resolveInside(projectPath, fileRel)
  await assertRealInside(projectPath, target)
  return target
}

/**
 * Raider may only replace or delete a file it wrote: the content must still hash
 * to the sidecar's hash and carry the generator's header (hashRuby ignores
 * comments, so a sidecar can't claim a hand-written spec just by its hash).
 */
export const isRaiderFile = (content: string, sidecar: Sidecar): boolean =>
  hashRuby(content) === sidecar.hash &&
  content.split(/\r?\n/).some((line) => line.trimStart().startsWith(RECORDED_MARKER))

// Marks the sidecar so the edited file is never touched again, then refuses
async function refuseAsCodeOwned(projectPath: string, sidecar: Sidecar): Promise<never> {
  await writeSidecar(projectPath, { ...sidecar, codeOwned: true })
  throw new CodeOwnedError(sidecar.file)
}

const buildSidecar = (
  test: Test,
  layout: ProjectLayout,
  file: string,
  content: string,
  createdAt: string,
  now: string
): Sidecar => ({
  version: 1,
  id: test.id,
  name: test.name,
  url: test.url,
  steps: test.steps,
  file,
  automation: layout.automation,
  hash: hashRuby(content),
  createdAt,
  updatedAt: now
})

const generate = (test: Test, layout: ProjectLayout, file: string): string =>
  generateProjectSpecFile(test, layout.automation, {
    fileRelPath: file,
    helperPath: layout.helperPath
  })

/** Picks a free `<slug>[_n]_spec.rb` and creates it without ever replacing a file. */
async function createNewSpec(
  projectPath: string,
  layout: ProjectLayout,
  test: Test
): Promise<{ file: string; content: string; target: string }> {
  const root = specRoot(layout)
  const slug = slugify(test.name)
  for (let n = 1; n <= MAX_SUFFIX; n++) {
    const name = n === 1 ? `${slug}_spec.rb` : `${slug}_${n}_spec.rb`
    const file = posix.join(root, name)
    const target = resolveInside(resolveInside(projectPath, root), name)
    if ((await exists(target)) || (await exists(sidecarPath(projectPath, file)))) continue
    // Check the folder, not the name: a racing save may create the name meanwhile,
    // and the exclusive create below never follows a link at the name itself
    await assertRealInside(projectPath, dirname(target))
    const content = generate(test, layout, file)
    await fs.mkdir(dirname(target), { recursive: true })
    try {
      await writeFileAtomic(target, content, { exclusive: true })
    } catch (error) {
      // Someone created it between the check and the write: try the next name
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue
      throw error
    }
    return { file, content, target }
  }
  throw new Error(`No free spec file name for ${slug}`)
}

// Per test id: the whole read-check-generate-write sequence runs one at a time
const testQueues = new Map<string, Promise<unknown>>()
// Keyed on the real project path so different spellings of it share one queue
function testKey(projectPath: string, testId: string): string {
  let project: string
  try {
    project = realpathSync.native(projectPath)
  } catch {
    project = resolve(projectPath)
  }
  return `${project}\0${testId}`
}

export function saveRecordedTest(
  projectPath: string,
  layout: ProjectLayout,
  test: Test
): Promise<Sidecar> {
  return serialize(testQueues, testKey(projectPath, test.id), async () => {
    const now = new Date().toISOString()
    const existing = await findSidecarById(projectPath, test.id)

    if (!existing) {
      const { file, content, target } = await createNewSpec(projectPath, layout, test)
      const sidecar = buildSidecar(test, layout, file, content, now, now)
      try {
        await writeSidecar(projectPath, sidecar)
      } catch (error) {
        // Without a sidecar the new file would look hand-written: remove what we just made
        await fs.unlink(target).catch(() => undefined)
        throw error
      }
      return sidecar
    }

    if (existing.codeOwned) throw new CodeOwnedError(existing.file)
    const target = await recordedFilePath(projectPath, existing.file)
    const onDisk = await readIfExists(target)
    if (onDisk !== null && !isRaiderFile(onDisk, existing)) {
      return refuseAsCodeOwned(projectPath, existing)
    }

    const content = generate(test, layout, existing.file)
    if (onDisk === null) {
      // Sidecar without its file: restore it, but never over a file that appeared meanwhile
      await fs.mkdir(dirname(target), { recursive: true })
      await writeFileAtomic(target, content, { exclusive: true })
    } else {
      await writeFileAtomic(target, content)
    }
    const sidecar = buildSidecar(test, layout, existing.file, content, existing.createdAt, now)
    await writeSidecar(projectPath, sidecar)
    return sidecar
  })
}

/**
 * Persists `codeOwned` for a test whose file no longer proves Raider wrote it.
 * Runs in the test's queue and re-checks first, so it can't race a save that
 * just rewrote the file. Returns whether the test is now code-owned.
 */
export function markCodeOwned(projectPath: string, testId: string): Promise<boolean> {
  return serialize(testQueues, testKey(projectPath, testId), async () => {
    const existing = await findSidecarById(projectPath, testId)
    if (!existing) return false
    if (existing.codeOwned) return true
    const target = await recordedFilePath(projectPath, existing.file)
    const onDisk = await readIfExists(target)
    if (onDisk === null || isRaiderFile(onDisk, existing)) return false
    await writeSidecar(projectPath, { ...existing, codeOwned: true })
    return true
  })
}

/** Removes a recorded test's spec file and sidecar. Refuses if the file was edited in code. */
export function deleteRecordedTest(projectPath: string, testId: string): Promise<void> {
  return serialize(testQueues, testKey(projectPath, testId), async () => {
    const existing = await findSidecarById(projectPath, testId)
    if (!existing) return
    if (existing.codeOwned) throw new CodeOwnedError(existing.file)

    const target = await recordedFilePath(projectPath, existing.file)
    const onDisk = await readIfExists(target)
    if (onDisk !== null) {
      if (!isRaiderFile(onDisk, existing)) return refuseAsCodeOwned(projectPath, existing)
      try {
        await fs.unlink(target)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    }
    await deleteSidecar(projectPath, existing.file)
  })
}
