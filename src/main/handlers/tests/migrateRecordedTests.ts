import { CODEGEN_VERSION } from '../../codegen/testFile'
import {
  CodeOwnedError,
  FlowsNotReadyError,
  TestGoneError,
  isRecordedRel,
  saveRecordedFlow,
  saveRecordedTest
} from './recordedTests'
import { isFlowFileRel } from '../../../shared/flows'
import { listSidecars, resolveInside } from './sidecar'
import { stat } from 'fs/promises'
import { safeError } from '../../utils/safeLog'
import type { ProjectLayout } from '../../../shared/types/projectLayout'
import type { Test } from '../../../shared/types/test'

/**
 * Rewrites the recorded specs written in an older codegen shape, once, when a
 * project opens. Only tests Raider still owns are touched: a file edited by hand
 * is left alone and marked code-owned, as any save would. Returns how many were
 * rewritten.
 */
const exists = (path: string): Promise<boolean> =>
  stat(path).then(
    (s) => s.isFile(),
    () => false
  )

export async function migrateRecordedTests(
  projectPath: string,
  layout: ProjectLayout,
  /** Rewrite current-shape specs too: a setting that changes the generated code changed */
  { force = false }: { force?: boolean } = {}
): Promise<number> {
  if (!layout.recordable) return 0
  let rewritten = 0
  for (const { fileRel, sidecar } of await listSidecars(projectPath)) {
    if (!sidecar || sidecar.file !== fileRel || sidecar.codeOwned) continue
    // The same rule as loading: a safe *_spec.rb path, or a flows/<name>_flow.rb flow file
    if (!isRecordedRel(fileRel)) continue
    // Only an older shape is rewritten: a file from a newer Raider is left as it is
    if (
      sidecar.codegen !== undefined &&
      (sidecar.codegen > CODEGEN_VERSION || (!force && sidecar.codegen === CODEGEN_VERSION))
    )
      continue
    // Only a file that exists: an unattended open never creates a spec from a sidecar alone
    if (!(await exists(resolveInside(projectPath, fileRel)))) continue
    const test: Test = {
      id: sidecar.id,
      name: sidecar.name,
      url: sidecar.url,
      steps: sidecar.steps,
      ...(sidecar.tags && { tags: sidecar.tags })
    }
    try {
      // A flow is written again from its record by the flow codegen, never renamed
      const saved = isFlowFileRel(fileRel)
        ? await saveRecordedFlow(projectPath, layout, test, { regenerate: true })
        : await saveRecordedTest(projectPath, layout, test, {
            knownFile: fileRel,
            regenerate: force
          })
      if (saved.codegen === CODEGEN_VERSION && !saved.codeOwned) rewritten++
    } catch (error) {
      if (
        !(error instanceof CodeOwnedError) &&
        !(error instanceof TestGoneError) &&
        !(error instanceof FlowsNotReadyError)
      )
        safeError(`Could not update ${fileRel}:`, error)
    }
  }
  return rewritten
}
