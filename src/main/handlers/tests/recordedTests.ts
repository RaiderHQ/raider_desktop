import fs from 'fs/promises'
import { realpathSync } from 'fs'
import { dirname, posix, resolve } from 'path'
import {
  CODEGEN_VERSION,
  generateProjectSpecFileWithMap,
  RECORDED_MARKER
} from '../../codegen/testFile'
import { hashRuby } from './codeHash'
import { deriveStepLines, usableStepLines } from './stepLines'
import { withSecretNames } from '../../../shared/secretSteps'
import { describeLineWithTags, findDescribeLine, normalizeTags } from '../../../shared/tags'
import {
  assertRealInside,
  deleteSidecar,
  isSafeRelPath,
  listSidecars,
  readSidecar,
  resolveInside,
  serialize,
  sidecarPath,
  writeFileAtomic,
  writeSidecar
} from './sidecar'
import { safeError } from '../../utils/safeLog'
import type { ProjectLayout } from '../../../shared/types/projectLayout'
import type { Sidecar, StepLines } from '../../../shared/types/projectTest'
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

export const specRoot = (layout: ProjectLayout): string => {
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
  file: string,
  content: string,
  stepLines: StepLines,
  createdAt: string,
  now: string
): Sidecar => ({
  version: 1,
  id: test.id,
  name: test.name,
  url: test.url,
  // The names the spec was generated with (generateProjectSpecFile names the same way)
  steps: withSecretNames(test.steps),
  file,
  hash: hashRuby(content),
  codegen: CODEGEN_VERSION,
  stepLines,
  ...(normalizeTags(test.tags).length > 0 && { tags: normalizeTags(test.tags) }),
  createdAt,
  updatedAt: now
})

const requireLine = (content: string): string | undefined =>
  content.split(/\r?\n/).find((line) => line.startsWith('require_relative '))

const generate = (
  test: Test,
  layout: ProjectLayout,
  file: string
): { content: string; stepLines: StepLines } =>
  generateProjectSpecFileWithMap(test, { fileRelPath: file, helperPath: layout.helperPath })

/**
 * Picks a free `<slug>[_n]_spec.rb` in `root` (default: the spec folder) and
 * creates it without ever replacing a file.
 */
async function createNewSpec(
  projectPath: string,
  layout: ProjectLayout,
  test: Test,
  root = specRoot(layout)
): Promise<{ file: string; content: string; stepLines: StepLines; target: string }> {
  const slug = slugify(test.name)
  for (let n = 1; n <= MAX_SUFFIX; n++) {
    const name = n === 1 ? `${slug}_spec.rb` : `${slug}_${n}_spec.rb`
    const file = posix.join(root, name)
    const target = resolveInside(resolveInside(projectPath, root), name)
    if ((await exists(target)) || (await exists(sidecarPath(projectPath, file)))) continue
    // Check the folder, not the name: a racing save may create the name meanwhile,
    // and the exclusive create below never follows a link at the name itself
    await assertRealInside(projectPath, dirname(target))
    const { content, stepLines } = generate(test, layout, file)
    await fs.mkdir(dirname(target), { recursive: true })
    try {
      await writeFileAtomic(target, content, { exclusive: true })
    } catch (error) {
      // Someone created it between the check and the write: try the next name
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue
      throw error
    }
    return { file, content, stepLines, target }
  }
  throw new Error(`No free spec file name for ${slug}`)
}

// The name a new test gets in the Recorder; its file is renamed once the user names it
const UNTITLED_SLUG = slugify('Untitled Test')
const UNTITLED_FILE = new RegExp(`^${UNTITLED_SLUG}(?:_\\d+)?_spec\\.rb$`)

const isUntitledFile = (file: string): boolean => UNTITLED_FILE.test(posix.basename(file))

// A blank name (e.g. mid-edit) keeps the file; so does a name that still slugs to "untitled_test"
const hasRealName = (test: Test): boolean =>
  /[a-z0-9]/i.test(test.name.normalize('NFKD')) && slugify(test.name) !== UNTITLED_SLUG

// A file written in an older codegen shape is never the same record: it is rewritten
const sameRecord = (sidecar: Sidecar, test: Test): boolean =>
  sidecar.codegen === CODEGEN_VERSION &&
  sidecar.name === test.name &&
  sidecar.url === test.url &&
  JSON.stringify(sidecar.tags ?? []) === JSON.stringify(normalizeTags(test.tags)) &&
  JSON.stringify(sidecar.steps) === JSON.stringify(test.steps)

/**
 * Moves a still-untitled recorded test to a file named after its real name, in
 * the same folder, never over an existing file. The caller has already proved
 * Raider wrote the old file. The new sidecar is written before the old one is
 * removed, so an interruption leaves a duplicate, never a lost test.
 */
async function moveToRealName(
  projectPath: string,
  layout: ProjectLayout,
  test: Test,
  existing: Sidecar,
  oldTarget: string,
  oldExists: boolean,
  now: string
): Promise<Sidecar> {
  const { file, content, stepLines, target } = await createNewSpec(
    projectPath,
    layout,
    test,
    posix.dirname(existing.file)
  )
  const sidecar = buildSidecar(test, file, content, stepLines, existing.createdAt, now)
  try {
    await writeSidecar(projectPath, sidecar)
  } catch (error) {
    await fs.unlink(target).catch(() => undefined)
    throw error
  }
  try {
    await deleteSidecar(projectPath, existing.file)
    if (oldExists) await fs.unlink(oldTarget)
  } catch (error) {
    safeError(`Could not remove the old file of renamed test ${test.id}:`, error)
  }
  return sidecar
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

/**
 * The sidecar for `testId` when the caller already knows where it is (`null`: none),
 * read fresh from that one place; falls back to a full scan if it isn't there.
 */
async function sidecarAt(
  projectPath: string,
  testId: string,
  knownFile: string | null
): Promise<Sidecar | null> {
  if (knownFile === null) return null
  const sidecar = isSpecRel(knownFile)
    ? await readSidecar(projectPath, knownFile).catch(() => null)
    : null
  if (sidecar?.id === testId && sidecar.file === knownFile) return sidecar
  return findSidecarById(projectPath, testId)
}

/**
 * Saves `test` as a spec file + sidecar. `knownFile` lets a caller that already
 * scanned the sidecars (e.g. a bulk migration) skip the per-test scan: the spec
 * path of the test's sidecar, or null when it has none.
 */
export function saveRecordedTest(
  projectPath: string,
  layout: ProjectLayout,
  input: Test,
  options: { knownFile?: string | null } = {}
): Promise<Sidecar> {
  return serialize(testQueues, testKey(projectPath, input.id), async () => {
    const now = new Date().toISOString()
    const current = layout
    const existing =
      options.knownFile !== undefined
        ? await sidecarAt(projectPath, input.id, options.knownFile)
        : await findSidecarById(projectPath, input.id)
    // Tags change only through set-test-tags: a save never takes tags from its caller
    const test: Test = { ...input, tags: existing?.tags }

    if (!existing) {
      const { file, content, stepLines, target } = await createNewSpec(projectPath, current, test)
      const sidecar = buildSidecar(test, file, content, stepLines, now, now)
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

    if (isUntitledFile(existing.file) && hasRealName(test)) {
      return moveToRealName(projectPath, current, test, existing, target, onDisk !== null, now)
    }

    const { content, stepLines } = generate(test, current, existing.file)
    // Nothing changed: keep the files and their timestamps as they are, even when
    // Raider would now write the same test differently (e.g. with the wait helper).
    // The file is already known to match its recorded hash (isRaiderFile above). The
    // require line must still be the one generated now, so a moved helper_path rewrites.
    if (
      onDisk !== null &&
      sameRecord(existing, test) &&
      requireLine(onDisk) === requireLine(content)
    ) {
      if (existing.stepLines) return existing
      // Recorded before maps were stored: map the kept file, without touching it
      const derived = deriveStepLines(existing, onDisk, current.helperPath)
      if (!derived) return existing
      const mapped = { ...existing, stepLines: derived }
      await writeSidecar(projectPath, mapped)
      return mapped
    }
    if (onDisk === null) {
      // Sidecar without its file: restore it, but never over a file that appeared meanwhile
      await fs.mkdir(dirname(target), { recursive: true })
      await writeFileAtomic(target, content, { exclusive: true })
    } else {
      await writeFileAtomic(target, content)
    }
    const sidecar = buildSidecar(
      test,
      existing.file,
      content,
      stepLines,
      existing.createdAt,
      now
    )
    await writeSidecar(projectPath, sidecar)
    return sidecar
  })
}

/**
 * The lines each step of `testId` occupies in its spec file, for mapping a
 * failure to a step. Runs in the test's queue, so it never reads a half-done
 * save. A map derived for an older sidecar is stored, keeping its timestamps.
 */
export function stepLinesFor(
  projectPath: string,
  layout: ProjectLayout,
  testId: string
): Promise<{ sidecar: Sidecar; stepLines: StepLines | null } | { none: 'notRecorded' | 'edited' }> {
  return serialize(testQueues, testKey(projectPath, testId), async () => {
    const existing = await findSidecarById(projectPath, testId)
    if (!existing) return { none: 'notRecorded' as const }
    if (existing.codeOwned) return { none: 'edited' as const }
    const onDisk = await readIfExists(await recordedFilePath(projectPath, existing.file))
    if (onDisk === null) return { none: 'notRecorded' as const }
    if (!isRaiderFile(onDisk, existing)) return { none: 'edited' as const }

    const stored = usableStepLines(existing, onDisk)
    if (stored) return { sidecar: existing, stepLines: stored }
    const derived = deriveStepLines(existing, onDisk, layout.helperPath)
    if (!derived) return { sidecar: existing, stepLines: null }
    const sidecar = { ...existing, stepLines: derived }
    await writeSidecar(projectPath, sidecar)
    return { sidecar, stepLines: derived }
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

export type SetTagsResult =
  | { kind: 'recorded' | 'codeOwned' | 'fileOnly' }
  | { kind: 'notFound' }
  | { kind: 'describeLine' }

/** Rewrites the first describe line of the spec at `target`, keeping its permissions. */
async function rewriteDescribeLine(
  projectPath: string,
  target: string,
  tags: string[]
): Promise<'ok' | 'notFound' | 'describeLine'> {
  await assertRealInside(projectPath, target)
  const stat = await fs.lstat(target).catch((e: NodeJS.ErrnoException) => {
    if (e.code === 'ENOENT') return null
    throw e
  })
  if (!stat?.isFile()) return 'notFound'
  const content = await fs.readFile(target, 'utf-8')
  const found = findDescribeLine(content)
  const rewritten = found ? describeLineWithTags(found.line, tags) : null
  if (!found || rewritten === null) return 'describeLine'
  if (rewritten !== found.line) {
    const updated =
      content.slice(0, found.index) + rewritten + content.slice(found.index + found.line.length)
    await writeFileAtomic(target, updated, { mode: stat.mode & 0o7777 })
  }
  return 'ok'
}

/**
 * Sets the tags of the spec at `fileRel` (under the layout's spec folder).
 * A test Raider still owns gets its spec file and sidecar regenerated; a test
 * edited in code gets its describe line rewritten and the sidecar mirrored;
 * a file with no sidecar gets only its describe line rewritten. Nothing is
 * written when the file is missing or its describe line can't be changed.
 */
export async function setTagsForFile(
  projectPath: string,
  layout: ProjectLayout,
  fileRel: string,
  tags: string[]
): Promise<SetTagsResult> {
  const root = specRoot(layout)
  if (!isSpecRel(fileRel) || !fileRel.startsWith(`${root}/`)) return { kind: 'notFound' }
  const clean = normalizeTags(tags)
  const target = resolveInside(projectPath, fileRel)
  const first = await readSidecar(projectPath, fileRel)
  const key = first ? first.id : `\0file\0${fileRel}`

  return serialize(testQueues, testKey(projectPath, key), async (): Promise<SetTagsResult> => {
    const existing = await readSidecar(projectPath, fileRel)
    // A sidecar that appeared while this call waited means Raider owns the file now
    if (!first && existing) return { kind: 'notFound' }
    if (first && (!existing || existing.id !== first.id || existing.file !== fileRel)) {
      return { kind: 'notFound' }
    }
    if (!existing) {
      const done = await rewriteDescribeLine(projectPath, target, clean)
      return done === 'ok' ? { kind: 'fileOnly' } : { kind: done }
    }

    const now = new Date().toISOString()
    await assertRealInside(projectPath, target)
    const stat = await fs.lstat(target).catch((e: NodeJS.ErrnoException) => {
      if (e.code === 'ENOENT') return null
      throw e
    })
    if (!stat?.isFile()) return { kind: 'notFound' }
    const onDisk = await readIfExists(target)
    if (onDisk === null) return { kind: 'notFound' }
    if (existing.codeOwned || !isRaiderFile(onDisk, existing)) {
      const done = await rewriteDescribeLine(projectPath, target, clean)
      if (done !== 'ok') return { kind: done }
      const sidecar: Sidecar = { ...existing, codeOwned: true, updatedAt: now }
      if (clean.length > 0) sidecar.tags = clean
      else delete sidecar.tags
      await writeSidecar(projectPath, sidecar)
      return { kind: 'codeOwned' }
    }

    const current = layout
    const test: Test = {
      id: existing.id,
      name: existing.name,
      url: existing.url,
      steps: existing.steps,
      tags: clean
    }
    const { content, stepLines } = generate(test, current, existing.file)
    await writeFileAtomic(target, content, { mode: stat.mode & 0o7777 })
    await writeSidecar(
      projectPath,
      buildSidecar(test, existing.file, content, stepLines, existing.createdAt, now)
    )
    return { kind: 'recorded' }
  })
}
