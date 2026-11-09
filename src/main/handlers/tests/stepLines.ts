import { generateProjectSpecFileWithMap, sha256Bytes } from '../../codegen/testFile'
import { generateFlowFileWithMap } from '../../codegen/flowFile'
import { isFlowFileRel } from '../../../shared/flows'
import type { Sidecar, StepLines } from '../../../shared/types/projectTest'

export { sha256Bytes }

// A flow file is rendered by the flow codegen; one that can't render (a check) maps nothing
function render(
  sidecar: Sidecar,
  helperPath: string,
  testIdAttribute?: string
): { content: string; stepLines: StepLines } | null {
  if (!isFlowFileRel(sidecar.file)) {
    return generateProjectSpecFileWithMap(
      { name: sidecar.name, steps: sidecar.steps },
      { fileRelPath: sidecar.file, helperPath, testIdAttribute }
    )
  }
  try {
    return generateFlowFileWithMap(
      { name: sidecar.name, steps: sidecar.steps },
      { testIdAttribute }
    )
  } catch {
    return null
  }
}

/**
 * The map for a sidecar that has none, found by regenerating its file in memory (a spec, or
 * a flow with the flow codegen). Only a render that matches the file byte for byte counts.
 */
export function deriveStepLines(
  sidecar: Sidecar,
  onDisk: string,
  helperPath: string,
  testIdAttribute?: string
): StepLines | null {
  const rendered = render(sidecar, helperPath, testIdAttribute)
  return rendered && rendered.content === onDisk ? rendered.stepLines : null
}

/** The stored map, while the file still has the exact bytes it was made for. */
export function usableStepLines(sidecar: Sidecar, onDisk: string): StepLines | null {
  return sidecar.stepLines?.fileSha256 === sha256Bytes(onDisk) ? sidecar.stepLines : null
}
