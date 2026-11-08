import { CODEGEN_VERSION } from '../../codegen/testFile'
import { CodeOwnedError, saveRecordedTest } from './recordedTests'
import { listSidecars } from './sidecar'
import { safeError } from '../../utils/safeLog'
import type { ProjectLayout } from '../../../shared/types/projectLayout'
import type { Test } from '../../../shared/types/test'

/**
 * Rewrites the recorded specs written in an older codegen shape, once, when a
 * project opens. Only tests Raider still owns are touched: a file edited by hand
 * is left alone and marked code-owned, as any save would. Returns how many were
 * rewritten.
 */
export async function migrateRecordedTests(
  projectPath: string,
  layout: ProjectLayout
): Promise<number> {
  if (!layout.recordable) return 0
  let rewritten = 0
  for (const { fileRel, sidecar } of await listSidecars(projectPath)) {
    if (!sidecar || sidecar.file !== fileRel || sidecar.codeOwned) continue
    if (sidecar.codegen === CODEGEN_VERSION) continue
    const test: Test = {
      id: sidecar.id,
      name: sidecar.name,
      url: sidecar.url,
      steps: sidecar.steps,
      ...(sidecar.tags && { tags: sidecar.tags })
    }
    try {
      const saved = await saveRecordedTest(projectPath, layout, test, { knownFile: fileRel })
      if (saved.codegen === CODEGEN_VERSION && !saved.codeOwned) rewritten++
    } catch (error) {
      if (!(error instanceof CodeOwnedError)) safeError(`Could not update ${fileRel}:`, error)
    }
  }
  return rewritten
}
