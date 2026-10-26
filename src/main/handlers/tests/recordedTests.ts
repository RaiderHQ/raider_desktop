import fs from 'fs/promises'
import { dirname, posix } from 'path'
import { generateProjectSpecFile } from '../../codegen/testFile'
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

const exists = (p: string): Promise<boolean> =>
  fs.access(p).then(
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

/** Absolute path of a spec file, checked to sit inside the project's spec folder. */
async function specFilePath(
  projectPath: string,
  layout: ProjectLayout,
  fileRel: string
): Promise<string> {
  const root = specRoot(layout)
  const inSpec = posix.relative(root, fileRel)
  if (!isSpecRel(fileRel) || !isSafeRelPath(inSpec))
    throw new Error(`Spec file is outside the spec folder: ${fileRel}`)
  const target = resolveInside(resolveInside(projectPath, root), inSpec)
  await assertRealInside(projectPath, target)
  return target
}

// Marks the sidecar so the edited file is never touched again, then refuses
async function markCodeOwned(projectPath: string, sidecar: Sidecar): Promise<never> {
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
    const file = posix.join(root, n === 1 ? `${slug}_spec.rb` : `${slug}_${n}_spec.rb`)
    const target = await specFilePath(projectPath, layout, file)
    if ((await exists(target)) || (await exists(sidecarPath(projectPath, file)))) continue
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
const testKey = (projectPath: string, testId: string): string => `${projectPath}\0${testId}`

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
    const target = await specFilePath(projectPath, layout, existing.file)
    const onDisk = await readIfExists(target)
    if (onDisk !== null && hashRuby(onDisk) !== existing.hash) {
      return markCodeOwned(projectPath, existing)
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

/** Removes a recorded test's spec file and sidecar. Refuses if the file was edited in code. */
export function deleteRecordedTest(projectPath: string, testId: string): Promise<void> {
  return serialize(testQueues, testKey(projectPath, testId), async () => {
    const existing = await findSidecarById(projectPath, testId)
    if (!existing) return
    if (existing.codeOwned) throw new CodeOwnedError(existing.file)

    // No layout here: the file only has to be a spec file inside the project
    const target = resolveInside(projectPath, existing.file)
    await assertRealInside(projectPath, target)
    const onDisk = await readIfExists(target)
    if (onDisk !== null) {
      if (hashRuby(onDisk) !== existing.hash) return markCodeOwned(projectPath, existing)
      try {
        await fs.unlink(target)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    }
    await deleteSidecar(projectPath, existing.file)
  })
}
