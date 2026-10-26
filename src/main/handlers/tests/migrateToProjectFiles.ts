import { randomUUID } from 'crypto'
import { findSidecarById, saveRecordedTest } from './recordedTests'
import { backupSuitesFile, readSuitesFile, saveSuiteIndex } from '../suitePersistence'
import type { SuiteIndexEntry } from '../suitePersistence'
import { safeError } from '../../utils/safeLog'
import { isStep } from '../../../shared/types/step'
import type { ProjectLayout } from '../../../shared/types/projectLayout'
import type { Test } from '../../../shared/types/test'

export interface MigrationResult {
  /** Tests now stored as spec files (including ones an earlier, interrupted run saved) */
  migrated: number
  /** Tests that could not be saved: still listed in the index, steps kept in the backup */
  failed: number
  /** The timestamped copy of the old suites.json, or null when nothing was migrated */
  backup: string | null
}

const NOTHING: MigrationResult = { migrated: 0, failed: 0, backup: null }

const isStr = (v: unknown): v is string => typeof v === 'string'

// Only a test that makes a valid sidecar may be saved: a bad one would be unreadable later
// and a re-run would save it again as a duplicate
const savable = (test: Test): Test | null => {
  if (!isStr(test?.id) || test.id === '' || !Array.isArray(test.steps)) return null
  if (!test.steps.every(isStep)) return null
  return {
    id: test.id,
    name: isStr(test.name) && test.name.trim() ? test.name : 'Recorded test',
    url: isStr(test.url) ? test.url : '',
    steps: test.steps
  }
}

/**
 * Moves the tests of a version 1/2 suites.json into spec files + sidecars and
 * rewrites suites.json as a version 3 index of test ids. Only for recordable
 * RSpec projects; anything else (Cucumber, version 3, missing or corrupt file)
 * is left untouched.
 *
 * Order matters for safety: backup first (throws, writing nothing, if that
 * fails), then each test (keeping its id; one already saved by an earlier run
 * is not saved again), then the index. A test that fails to save stays in the
 * index; the backup still holds its steps.
 */
export async function migrateToProjectFiles(
  projectPath: string,
  layout: ProjectLayout
): Promise<MigrationResult> {
  if (layout.framework !== 'rspec' || !layout.recordable) return NOTHING
  const state = await readSuitesFile(projectPath)
  if (state.kind !== 'legacy') return NOTHING

  const backup = await backupSuitesFile(projectPath)
  // The file vanished since it was read: there is nothing left to migrate
  if (backup === null) return NOTHING

  let migrated = 0
  let failed = 0
  const done = new Set<string>()
  const index: SuiteIndexEntry[] = []

  for (const suite of state.suites) {
    const testIds: string[] = []
    for (const original of suite.tests) {
      const test = savable(original)
      if (!test) {
        safeError('Could not move a recorded test with missing or unreadable data')
        failed++
        if (isStr(original?.id) && original.id !== '') testIds.push(original.id)
        continue
      }
      testIds.push(test.id)
      // The same test listed in two suites is one file
      if (done.has(test.id)) continue
      done.add(test.id)
      try {
        if (!(await findSidecarById(projectPath, test.id))) {
          await saveRecordedTest(projectPath, layout, test)
        }
        migrated++
      } catch (error) {
        safeError(`Could not move recorded test ${test.id} to a spec file:`, error)
        failed++
      }
    }
    index.push({
      id: isStr(suite.id) && suite.id !== '' ? suite.id : randomUUID(),
      name: isStr(suite.name) ? suite.name : 'Suite',
      testIds
    })
  }

  await saveSuiteIndex(projectPath, index)
  return { migrated, failed, backup }
}
