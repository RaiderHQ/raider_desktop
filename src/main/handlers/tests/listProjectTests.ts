import fs from 'fs/promises'
import { posix } from 'path'
import { isRaiderFile, markCodeOwned } from './recordedTests'
import { assertRealInside, isSafeRelPath, listSidecars, resolveInside } from './sidecar'
import { safeError } from '../../utils/safeLog'
import type { ProjectLayout } from '../../../shared/types/projectLayout'
import type { ProjectTestEntry, Sidecar } from '../../../shared/types/projectTest'

const isSpecRel = (rel: unknown): rel is string => isSafeRelPath(rel) && rel.endsWith('_spec.rb')
const DESCRIBE = /^\s*(?:RSpec\.)?describe\s*\(?\s*(['"])(.+?)\1/m

const SKIP_DIRS = new Set(['node_modules', '.git', 'vendor', '.raider'])
const CONCURRENCY = 16

// Symlinks (files and folders) are never followed
async function walkSpecs(dir: string, prefix: string): Promise<string[]> {
  const out: string[] = []
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const rel = `${prefix}/${entry.name}`
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) out.push(...(await walkSpecs(`${dir}/${entry.name}`, rel)))
    } else if (entry.isFile() && entry.name.endsWith('_spec.rb')) out.push(rel)
  }
  return out
}

async function specFilesUnder(projectPath: string, specPath: string): Promise<string[]> {
  const root = posix.normalize(specPath.replace(/\\/g, '/')).replace(/\/+$/, '')
  if (!isSafeRelPath(root)) return []
  try {
    const abs = resolveInside(projectPath, root)
    await assertRealInside(projectPath, abs)
    return await walkSpecs(abs, root)
  } catch {
    return []
  }
}

async function sidecarsOrNone(projectPath: string): ReturnType<typeof listSidecars> {
  try {
    return await listSidecars(projectPath)
  } catch (error) {
    safeError('Could not read recorded test records:', error)
    return []
  }
}

// null when the file is missing; throws for anything unreadable or a symlink
async function readSpec(projectPath: string, fileRel: string): Promise<string | null> {
  const target = resolveInside(projectPath, fileRel)
  await assertRealInside(projectPath, target)
  const stat = await fs.lstat(target).catch((e: NodeJS.ErrnoException) => {
    if (e.code === 'ENOENT') return null
    throw e
  })
  if (!stat) return null
  if (!stat.isFile()) throw new Error(`Not a regular file: ${fileRel}`)
  return fs.readFile(target, 'utf-8')
}

const fallbackName = (content: string | null, file: string): string =>
  (content && DESCRIBE.exec(content)?.[2]) || posix.basename(file)

/**
 * Who may edit a recorded test, by the same proof the writer uses, so "Recorded"
 * never names a file Raider would refuse. A missing file stays recorded (saving
 * restores it) unless the test was already marked code-owned. Throws when the
 * spec can't be read.
 */
export async function recordedOwnership(
  projectPath: string,
  sidecar: Sidecar
): Promise<{ ownership: 'recorded' | 'codeOwnedWasRecorded'; missingFile?: true }> {
  const content = await readSpec(projectPath, sidecar.file)
  const missing = content === null ? ({ missingFile: true } as const) : {}
  if (sidecar.codeOwned) return { ownership: 'codeOwnedWasRecorded', ...missing }
  if (content === null || isRaiderFile(content, sidecar))
    return { ownership: 'recorded', ...missing }
  try {
    if (!(await markCodeOwned(projectPath, sidecar.id))) return { ownership: 'recorded' }
  } catch (error) {
    safeError(`Could not mark ${sidecar.file} as edited in code:`, error)
  }
  return { ownership: 'codeOwnedWasRecorded' }
}

async function entryFor(
  projectPath: string,
  file: string,
  sidecar: Sidecar | null
): Promise<ProjectTestEntry> {
  try {
    if (!sidecar) {
      return {
        file,
        name: fallbackName(await readSpec(projectPath, file), file),
        ownership: 'code'
      }
    }
    return {
      file,
      name: sidecar.name,
      testId: sidecar.id,
      ...(await recordedOwnership(projectPath, sidecar))
    }
  } catch (error) {
    safeError(`Could not read ${file}:`, error)
    return { file, name: sidecar?.name ?? posix.basename(file), ownership: 'code' }
  }
}

export async function listProjectTests(
  projectPath: string,
  layout: ProjectLayout
): Promise<ProjectTestEntry[]> {
  if (layout.framework !== 'rspec') return []

  // A sidecar only counts when it sits where its own `file` says
  const sidecars = new Map<string, Sidecar>()
  for (const { fileRel, sidecar } of await sidecarsOrNone(projectPath)) {
    if (sidecar && sidecar.file === fileRel && isSpecRel(fileRel)) sidecars.set(fileRel, sidecar)
  }
  const files = new Set<string>(await specFilesUnder(projectPath, layout.specPath))
  for (const file of sidecars.keys()) files.add(file)

  const queue = [...files]
  const entries: ProjectTestEntry[] = []
  const worker = async (): Promise<void> => {
    for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
      try {
        entries.push(await entryFor(projectPath, file, sidecars.get(file) ?? null))
      } catch (error) {
        safeError(`Could not list ${file}:`, error)
        entries.push({ file, name: posix.basename(file), ownership: 'code' })
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker))
  return entries.sort((a, b) => a.name.localeCompare(b.name) || a.file.localeCompare(b.file))
}
