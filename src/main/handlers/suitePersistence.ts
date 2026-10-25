import fs from 'fs/promises'
import { join } from 'path'
import { appState } from './appState'
import { safeError } from '../utils/safeLog'
import type { Suite } from '@foundation/Types/suite'

// Written as version 1 until Task 10 adds the Step model migration and bumps writes to 2.
export interface SuitesFile {
  version: 1 | 2
  suites: Suite[]
}

const WRITE_VERSION = 1

const raiderDir = (projectPath: string): string => join(projectPath, '.raider')
const suitesFile = (projectPath: string): string => join(raiderDir(projectPath), 'suites.json')

function extractSuites(parsed: unknown): Suite[] | null {
  // A plain array of suites (no version) is accepted as-is
  if (Array.isArray(parsed)) return parsed as Suite[]
  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as SuitesFile).suites)) {
    return (parsed as SuitesFile).suites
  }
  return null
}

export async function loadSuites(
  projectPath: string
): Promise<{ suites: Suite[]; recoveredFromCorrupt: boolean }> {
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

  let suites: Suite[] | null = null
  try {
    suites = extractSuites(JSON.parse(raw))
  } catch {
    suites = null
  }

  if (suites === null) {
    await fs.rename(file, `${file}.bak`)
    return { suites: [], recoveredFromCorrupt: true }
  }

  // TODO(Task 10): migrate version-1 tests (string[] steps) here via migrateLegacyTest
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
