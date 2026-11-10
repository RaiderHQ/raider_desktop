import { recordedOwnership } from './listProjectTests'
import { isSafeRelPath, listSidecars } from './sidecar'
import { safeError } from '../../utils/safeLog'
import type { Sidecar } from '../../../shared/types/projectTest'
import type { Test } from '../../../shared/types/test'

const isSpecRel = (rel: unknown): rel is string => isSafeRelPath(rel) && rel.endsWith('_spec.rb')

async function testFor(projectPath: string, sidecar: Sidecar): Promise<Test> {
  const base = {
    id: sidecar.id,
    name: sidecar.name,
    url: sidecar.url,
    steps: sidecar.steps,
    file: sidecar.file,
    ...(sidecar.tags && { tags: sidecar.tags })
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
 * Every recorded test of the project, from its sidecars. A sidecar only counts where its own
 * `file` says (the same rule as findSidecarById); a duplicate id resolves to the first.
 */
export async function loadRecordedTests(projectPath: string): Promise<Test[]> {
  const seen = new Set<string>()
  const tests: Test[] = []
  for (const { fileRel, sidecar } of await listSidecars(projectPath)) {
    if (!sidecar || sidecar.file !== fileRel || !isSpecRel(fileRel) || seen.has(sidecar.id)) {
      continue
    }
    seen.add(sidecar.id)
    tests.push(await testFor(projectPath, sidecar))
  }
  return tests
}
