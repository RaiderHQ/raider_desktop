import { recordedOwnership } from './listProjectTests'
import { listSidecars } from './sidecar'
import { isRecordedRel } from './recordedTests'
import { isFlowFileRel } from '../../../shared/flows'
import { safeError } from '../../utils/safeLog'
import type { Sidecar } from '../../../shared/types/projectTest'
import type { Test } from '../../../shared/types/test'

async function testFor(projectPath: string, sidecar: Sidecar): Promise<Test> {
  const base = {
    id: sidecar.id,
    name: sidecar.name,
    url: sidecar.url,
    steps: sidecar.steps,
    file: sidecar.file,
    ...(sidecar.tags && { tags: sidecar.tags }),
    // Where a record sits says what it is: a flow file's record is a flow
    ...(isFlowFileRel(sidecar.file)
      ? { kind: 'flow' as const }
      : sidecar.kind && { kind: sidecar.kind }),
    ...(sidecar.inputs && { inputs: sidecar.inputs })
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
 * Every recorded test and flow of the project, from its sidecars. A sidecar only counts where its own
 * `file` says (the same rule as findSidecarById); a duplicate id resolves to the first.
 */
export async function loadRecordedTests(projectPath: string): Promise<Test[]> {
  const seen = new Set<string>()
  const tests: Test[] = []
  for (const { fileRel, sidecar } of await listSidecars(projectPath)) {
    if (!sidecar || sidecar.file !== fileRel || !isRecordedRel(fileRel) || seen.has(sidecar.id)) {
      continue
    }
    seen.add(sidecar.id)
    tests.push(await testFor(projectPath, sidecar))
  }
  return tests
}
