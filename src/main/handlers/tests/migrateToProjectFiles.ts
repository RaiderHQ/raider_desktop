import { createHash } from 'crypto'
import { CodeOwnedError, saveRecordedTest } from './recordedTests'
import { isSafeRelPath, listSidecars } from './sidecar'
import { backupSuitesFile, readSuitesFile, saveSuiteIndex } from '../suitePersistence'
import type { SuiteIndexEntry } from '../suitePersistence'
import { safeError } from '../../utils/safeLog'
import { isStep } from '../../../shared/types/step'
import type { Step } from '../../../shared/types/step'
import type { ProjectLayout } from '../../../shared/types/projectLayout'
import type { Test } from '../../../shared/types/test'

export interface MigrationResult {
  /** Tests now stored as spec files (a spec the user already edited in code counts too) */
  migrated: number
  /** The timestamped copy of the old suites.json, or null when nothing was migrated */
  backup: string | null
}

/**
 * The migration stopped before writing the index, so suites.json is still the
 * old version and nothing is lost: run it again on the next activation. Tests
 * saved so far are found again by id and updated in place.
 */
export class MigrationPostponedError extends Error {
  constructor(
    readonly backup: string,
    readonly cause: unknown
  ) {
    super(`Moving recorded tests to project files was postponed: ${(cause as Error)?.message}`)
    this.name = 'MigrationPostponedError'
  }
}

const NOTHING: MigrationResult = { migrated: 0, backup: null }
export const UNREADABLE_STEP = '# Could not read this step: '

const isStr = (v: unknown): v is string => typeof v === 'string' && v !== ''

// The same input always gives the same id, so a re-run after a postponed migration
// finds the test it saved last time instead of saving it again
function stableId(...parts: (string | number)[]): string {
  const hex = createHash('sha256').update(parts.join('\0')).digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

// JSON escapes \n and \r; these also break lines in some editors
const oneLine = (text: string): string =>
  text.replace(
    /[\u0085\u2028\u2029]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`
  )

// A step today's model can't read becomes a Ruby comment, so the test still migrates
// and the user sees which step to redo
function readableStep(step: unknown, fallbackId: string): Step {
  if (isStep(step)) return step
  const id = isStr((step as Step | null)?.id) ? (step as Step).id : fallbackId
  const json = JSON.stringify(step) ?? String(step)
  return { id, kind: 'custom', code: UNREADABLE_STEP + oneLine(json) }
}

const isSpecRel = (rel: unknown): rel is string => isSafeRelPath(rel) && rel.endsWith('_spec.rb')

// One scan of the sidecars, by test id (same rule as findSidecarById)
async function sidecarFiles(projectPath: string): Promise<Map<string, string>> {
  const byId = new Map<string, string>()
  for (const { fileRel, sidecar } of await listSidecars(projectPath)) {
    if (sidecar && sidecar.file === fileRel && isSpecRel(fileRel) && !byId.has(sidecar.id)) {
      byId.set(sidecar.id, fileRel)
    }
  }
  return byId
}

/**
 * Moves the tests of a version 1/2 suites.json into spec files + sidecars and
 * rewrites suites.json as a version 3 index of test ids. Only for recordable
 * RSpec projects; anything else (Cucumber, version 3 or newer, missing or
 * corrupt file) is left untouched.
 *
 * No test is dropped: unreadable steps become comments, a missing or reused id
 * gets a new stable one. Order: backup (throws, writing nothing, if that fails),
 * then every test (an existing sidecar is updated in place; a spec edited in
 * code is kept as is), then the index, only if suites.json is unchanged since
 * it was read. Any save error or a changed file throws MigrationPostponedError
 * and leaves the old suites.json in place.
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

  const known = await sidecarFiles(projectPath)
  // Test id → the version saved under it, to tell a shared test from a reused id
  const saved = new Map<string, string>()
  const index: SuiteIndexEntry[] = []
  let migrated = 0

  for (const [suitePos, suite] of state.suites.entries()) {
    const suiteKey = isStr(suite.id) ? suite.id : `#${suitePos}`
    const testIds: string[] = []
    for (const [testPos, original] of (suite.tests ?? []).entries()) {
      const originalId = isStr(original?.id) ? original.id : ''
      const fresh = stableId('test', suiteKey, testPos, originalId)
      const steps = Array.isArray(original?.steps) ? original.steps : []
      const content = {
        name: isStr(original?.name) && original.name.trim() ? original.name : 'Recorded test',
        url: typeof original?.url === 'string' ? original.url : '',
        steps: steps.map((step, i) => readableStep(step, stableId('step', fresh, i)))
      }
      const body = JSON.stringify(content)
      let id = originalId || fresh
      // The same test listed in two suites is one file; a different test reusing
      // the id gets its own
      if (saved.has(id) && saved.get(id) !== body) id = fresh
      testIds.push(id)
      if (saved.has(id)) continue
      saved.set(id, body)

      const test: Test = { id, ...content }
      try {
        await saveRecordedTest(projectPath, layout, test, { knownFile: known.get(id) ?? null })
      } catch (error) {
        // The user edited the file in code: their version wins and is kept as is
        if (!(error instanceof CodeOwnedError)) {
          safeError(`Could not move recorded test ${id} to a spec file:`, error)
          throw new MigrationPostponedError(backup, error)
        }
      }
      migrated++
    }
    index.push({
      id: isStr(suite.id) ? suite.id : stableId('suite', suitePos),
      name: typeof suite.name === 'string' ? suite.name : 'Suite',
      testIds
    })
  }

  try {
    // A version 2 save that landed meanwhile must not be overwritten: postpone instead
    await saveSuiteIndex(projectPath, index, { ifUnchanged: state.raw })
  } catch (error) {
    safeError('Could not write the suites index:', error)
    throw new MigrationPostponedError(backup, error)
  }
  return { migrated, backup }
}
