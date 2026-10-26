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

// The raw suites file, or null when there is none
async function readRaw(file: string): Promise<string | null> {
  try {
    return await fs.readFile(file, 'utf-8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

const parseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

// Moving the bad file aside is best-effort: the project still opens with no suites
async function recoverCorrupt(
  file: string
): Promise<{ suites: never[]; recoveredFromCorrupt: true; backupSaved: boolean }> {
  try {
    await fs.rename(file, await backupName(file))
    return { suites: [], recoveredFromCorrupt: true, backupSaved: true }
  } catch (error) {
    safeError('Failed to back up corrupt suites file:', error)
    return { suites: [], recoveredFromCorrupt: true, backupSaved: false }
  }
}

export async function loadSuites(
  projectPath: string
): Promise<{ suites: Suite[]; recoveredFromCorrupt: boolean; backupSaved?: boolean }> {
  const file = suitesFile(projectPath)
  const raw = await readRaw(file)
  if (raw === null) return { suites: [], recoveredFromCorrupt: false }

  const extracted = extractSuites(parseJson(raw))
  if (extracted === null) return recoverCorrupt(file)

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
  return writeSuitesFile(projectPath, body)
}

// Every suites.json write (version 2 or 3) goes through here, so they share one queue.
// With `ifUnchanged`, the write only happens while the file still holds exactly that text.
function writeSuitesFile(projectPath: string, body: string, ifUnchanged?: string): Promise<void> {
  const file = suitesFile(projectPath)
  const previous = writeQueues.get(projectPath) ?? Promise.resolve()
  const write = previous.then(async () => {
    if (ifUnchanged !== undefined && (await readRaw(file)) !== ifUnchanged) {
      throw new SuitesFileChangedError()
    }
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

// --- Version 3: suites.json is an index of test ids; the tests live in spec files + sidecars ---

export interface SuiteIndexFile {
  version: 3
  suites: { id: string; name: string; testIds: string[] }[]
}
export type SuiteIndexEntry = SuiteIndexFile['suites'][number]

const INDEX_VERSION = 3

/** suites.json is still version 1 or 2: it must be migrated, never treated as a corrupt index. */
export class LegacySuitesFileError extends Error {
  constructor(readonly version: number) {
    super(`The suites file is version ${version} and has not been migrated yet`)
    this.name = 'LegacySuitesFileError'
  }
}

/** suites.json is newer than this app understands: leave it alone. */
export class UnknownSuitesVersionError extends Error {
  constructor(readonly version: number) {
    super(`The suites file is version ${version}, made by a newer Raider`)
    this.name = 'UnknownSuitesVersionError'
  }
}

/** suites.json changed since it was read, so a conditional write was skipped. */
export class SuitesFileChangedError extends Error {
  constructor() {
    super('The suites file changed while it was being updated')
    this.name = 'SuitesFileChangedError'
  }
}

const isStr = (v: unknown): v is string => typeof v === 'string'
const isIndexEntry = (suite: unknown): suite is SuiteIndexEntry => {
  const s = suite as SuiteIndexEntry | null
  return (
    s !== null &&
    typeof s === 'object' &&
    isStr(s.id) &&
    isStr(s.name) &&
    Array.isArray(s.testIds) &&
    s.testIds.every(isStr)
  )
}

export type SuitesFileState =
  | { kind: 'missing' }
  | { kind: 'corrupt' }
  | { kind: 'index'; suites: SuiteIndexEntry[] }
  | { kind: 'legacy'; version: number; suites: Suite[]; raw: string }
  | { kind: 'unknown'; version: number }

type Classified =
  | Exclude<SuitesFileState, { kind: 'missing' } | { kind: 'legacy' }>
  | {
      kind: 'legacy'
      version: number
      suites: Suite[]
    }

function classify(parsed: unknown): Classified {
  const version = (parsed as SuiteIndexFile | null)?.version as unknown
  if (typeof version === 'number' && version > INDEX_VERSION) return { kind: 'unknown', version }
  if (
    parsed &&
    typeof parsed === 'object' &&
    (parsed as SuiteIndexFile).version === INDEX_VERSION
  ) {
    const { suites } = parsed as SuiteIndexFile
    return Array.isArray(suites) && suites.every(isIndexEntry)
      ? { kind: 'index', suites }
      : { kind: 'corrupt' }
  }
  const extracted = extractSuites(parsed)
  return extracted ? { kind: 'legacy', ...extracted } : { kind: 'corrupt' }
}

/**
 * What suites.json currently holds, without changing it. Version 1 Ruby steps
 * are converted in memory, so `legacy` suites always hold structured Steps.
 */
export async function readSuitesFile(projectPath: string): Promise<SuitesFileState> {
  const raw = await readRaw(suitesFile(projectPath))
  if (raw === null) return { kind: 'missing' }
  const state = classify(parseJson(raw))
  if (state.kind !== 'legacy') return state
  const suites = state.version < WRITE_VERSION ? migrateSuites(state.suites) : state.suites
  return { ...state, suites, raw }
}

/**
 * Loads the version 3 index. A corrupt file is moved aside like in loadSuites;
 * a version 1/2 file throws LegacySuitesFileError and is left untouched.
 */
export async function loadSuiteIndex(
  projectPath: string
): Promise<{ suites: SuiteIndexEntry[]; recoveredFromCorrupt: boolean; backupSaved?: boolean }> {
  const file = suitesFile(projectPath)
  const raw = await readRaw(file)
  if (raw === null) return { suites: [], recoveredFromCorrupt: false }
  const state = classify(parseJson(raw))
  if (state.kind === 'index') return { suites: state.suites, recoveredFromCorrupt: false }
  if (state.kind === 'legacy') throw new LegacySuitesFileError(state.version)
  if (state.kind === 'unknown') throw new UnknownSuitesVersionError(state.version)
  return recoverCorrupt(file)
}

/**
 * Writes the version 3 index. With `ifUnchanged`, it only replaces a file that still
 * holds exactly that text, else rejects with SuitesFileChangedError.
 */
export function saveSuiteIndex(
  projectPath: string,
  suites: SuiteIndexEntry[],
  { ifUnchanged }: { ifUnchanged?: string } = {}
): Promise<void> {
  const body = JSON.stringify({ version: INDEX_VERSION, suites } satisfies SuiteIndexFile, null, 2)
  return writeSuitesFile(projectPath, body, ifUnchanged)
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
