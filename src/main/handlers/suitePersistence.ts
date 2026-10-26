import fs from 'fs/promises'
import { join } from 'path'
import { appState } from './appState'
import { safeError } from '../utils/safeLog'
import type { Suite } from '@foundation/Types/suite'
import { migrateLegacyTest } from '../codegen/legacy'

// Version 1 stored steps as Ruby strings; version 2 stores structured Steps.
export interface SuitesFile {
  version: 1 | 2
  suites: Suite[]
}

const WRITE_VERSION = 2

const raiderDir = (projectPath: string): string => join(projectPath, '.raider')
const suitesFile = (projectPath: string): string => join(raiderDir(projectPath), 'suites.json')

// Version 2 suites are used as-is, so each must hold a tests array whose tests hold a steps array
const isV2Suite = (suite: unknown): boolean => {
  const tests = (suite as Suite | null)?.tests
  return (
    Array.isArray(tests) &&
    tests.every((test) => test !== null && typeof test === 'object' && Array.isArray(test.steps))
  )
}

function extractSuites(parsed: unknown): { suites: Suite[]; version: number } | null {
  // A plain array of suites (no version) predates versioning, so it is version 1
  if (Array.isArray(parsed)) return { suites: parsed as Suite[], version: 1 }
  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as SuitesFile).suites)) {
    const { suites, version } = parsed as SuitesFile
    const v = typeof version === 'number' ? version : 1
    if (v >= WRITE_VERSION && !suites.every(isV2Suite)) return null
    return { suites, version: v }
  }
  return null
}

// Timestamped (plus a counter on a clash) so a later backup never overwrites an earlier one
async function backupName(file: string): Promise<string> {
  const base = `${file}.${new Date().toISOString().replace(/[:.]/g, '-')}`
  for (let n = 0; ; n++) {
    const candidate = n === 0 ? `${base}.bak` : `${base}-${n}.bak`
    try {
      await fs.access(candidate)
    } catch {
      return candidate
    }
  }
}

/**
 * Copies the project's suites.json to a timestamped .bak before it gets replaced.
 * Returns the backup path, or null when there is no suites file to keep.
 */
export async function backupSuitesFile(projectPath: string): Promise<string | null> {
  const file = suitesFile(projectPath)
  const backup = await backupName(file)
  try {
    await fs.copyFile(file, backup)
    return backup
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

const migrateSuites = (suites: Suite[]): Suite[] =>
  suites.map((suite) => ({ ...suite, tests: (suite.tests ?? []).map(migrateLegacyTest) }))

export async function loadSuites(
  projectPath: string
): Promise<{ suites: Suite[]; recoveredFromCorrupt: boolean; backupSaved?: boolean }> {
  const file = suitesFile(projectPath)
  let raw: string
  try {
    raw = await fs.readFile(file, 'utf-8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { suites: [], recoveredFromCorrupt: false }
    }
    throw error
  }

  let extracted: ReturnType<typeof extractSuites> = null
  try {
    extracted = extractSuites(JSON.parse(raw))
  } catch {
    extracted = null
  }

  if (extracted === null) {
    // Moving the bad file aside is best-effort: the project still opens with no suites
    try {
      await fs.rename(file, await backupName(file))
      return { suites: [], recoveredFromCorrupt: true, backupSaved: true }
    } catch (error) {
      safeError('Failed to back up corrupt suites file:', error)
      return { suites: [], recoveredFromCorrupt: true, backupSaved: false }
    }
  }

  if (extracted.version >= WRITE_VERSION) {
    return { suites: extracted.suites, recoveredFromCorrupt: false }
  }

  // Older files hold Ruby string steps: convert once and rewrite in the current format.
  // Both writes are best-effort, so a read-only project still opens with the migrated suites.
  const suites = migrateSuites(extracted.suites)
  try {
    await fs.copyFile(file, `${file}.v1.bak`)
  } catch (error) {
    safeError('Failed to back up version 1 suites file:', error)
  }
  try {
    await saveSuites(projectPath, suites)
  } catch (error) {
    safeError('Failed to rewrite migrated suites file:', error)
  }
  return { suites, recoveredFromCorrupt: false }
}

// Writes per project are chained so two quick saves can't interleave tmp/rename
const writeQueues = new Map<string, Promise<unknown>>()

export function saveSuites(projectPath: string, suites: Suite[]): Promise<void> {
  // Serialize now so later in-memory mutations don't leak into this write
  const body = JSON.stringify({ version: WRITE_VERSION, suites } satisfies SuitesFile, null, 2)
  const file = suitesFile(projectPath)
  const previous = writeQueues.get(projectPath) ?? Promise.resolve()
  const write = previous.then(async () => {
    await fs.mkdir(raiderDir(projectPath), { recursive: true })
    const tmp = `${file}.tmp`
    await fs.writeFile(tmp, body, 'utf-8')
    await fs.rename(tmp, file)
  })
  // A failed write must not block later ones
  writeQueues.set(
    projectPath,
    write.catch(() => undefined)
  )
  return write
}

/** Saves appState.suites to the active project. No-op without one; never rejects. */
export async function persistActiveSuites(): Promise<void> {
  const projectPath = appState.projectPath
  if (!projectPath) return
  try {
    await saveSuites(projectPath, Array.from(appState.suites.values()))
  } catch (error) {
    safeError('Failed to save suites:', error)
  }
}
