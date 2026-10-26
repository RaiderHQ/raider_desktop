import { recordedOwnership } from './listProjectTests'
import { isSafeRelPath, listSidecars } from './sidecar'
import { loadSuiteIndex } from '../suitePersistence'
import type { SuiteIndexEntry } from '../suitePersistence'
import { safeError } from '../../utils/safeLog'
import type { Sidecar } from '../../../shared/types/projectTest'
import type { Suite } from '../../../shared/types/suite'
import type { Test } from '../../../shared/types/test'

const isSpecRel = (rel: unknown): rel is string => isSafeRelPath(rel) && rel.endsWith('_spec.rb')

// Same rule as findSidecarById: a sidecar only counts where its own `file` says
async function sidecarsById(projectPath: string): Promise<Map<string, Sidecar>> {
  const byId = new Map<string, Sidecar>()
  for (const { fileRel, sidecar } of await listSidecars(projectPath)) {
    if (sidecar && sidecar.file === fileRel && isSpecRel(fileRel) && !byId.has(sidecar.id)) {
      byId.set(sidecar.id, sidecar)
    }
  }
  return byId
}

async function testFor(projectPath: string, sidecar: Sidecar): Promise<Test> {
  const base = {
    id: sidecar.id,
    name: sidecar.name,
    url: sidecar.url,
    steps: sidecar.steps,
    file: sidecar.file
  }
  try {
    const { ownership } = await recordedOwnership(projectPath, sidecar)
    return { ...base, ownership }
  } catch (error) {
    // Unreadable spec: show the test, but never let Raider rewrite a file it can't check
    safeError(`Could not read ${sidecar.file}:`, error)
    return { ...base, ownership: 'codeOwnedWasRecorded' }
  }
}

/**
 * The project's suites, built from the version 3 index and the recorded tests'
 * sidecars. An indexed id without a sidecar is left out (and logged) but stays
 * in the index. Throws LegacySuitesFileError while suites.json is still version 1/2.
 */
export async function assembleSuites(projectPath: string): Promise<Suite[]> {
  const { suites: index } = await loadSuiteIndex(projectPath)
  return assembleFromIndex(projectPath, index)
}

/** As assembleSuites, for a caller that already loaded the index (e.g. to see recoveredFromCorrupt). */
export async function assembleFromIndex(
  projectPath: string,
  index: SuiteIndexEntry[]
): Promise<Suite[]> {
  if (index.length === 0) return []
  const sidecars = await sidecarsById(projectPath)

  return Promise.all(
    index.map(async ({ id, name, testIds }) => {
      const tests: Test[] = []
      for (const testId of testIds) {
        const sidecar = sidecars.get(testId)
        if (!sidecar) {
          safeError(`Recorded test ${testId} in suite "${name}" has no saved file record`)
          continue
        }
        tests.push(await testFor(projectPath, sidecar))
      }
      return { id, name, tests }
    })
  )
}

/**
 * Recorded tests whose id no suite in `index` lists, one per id, in file order
 * (a duplicate id resolves to the same sidecar as everywhere else).
 */
export async function unlistedTests(
  projectPath: string,
  index: SuiteIndexEntry[]
): Promise<Test[]> {
  const listed = new Set(index.flatMap((entry) => entry.testIds))
  const tests: Test[] = []
  for (const sidecar of (await sidecarsById(projectPath)).values()) {
    if (!listed.has(sidecar.id)) tests.push(await testFor(projectPath, sidecar))
  }
  return tests
}
