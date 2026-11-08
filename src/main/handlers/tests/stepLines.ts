import { generateProjectSpecFileWithMap, sha256Bytes } from '../../codegen/testFile'
import type { Sidecar, StepLines } from '../../../shared/types/projectTest'

export { sha256Bytes }

/**
 * The map for a sidecar that has none, found by regenerating its spec in memory.
 * Only a render that matches the file byte for byte counts.
 */
export function deriveStepLines(
  sidecar: Sidecar,
  onDisk: string,
  helperPath: string
): StepLines | null {
  const { content, stepLines } = generateProjectSpecFileWithMap(
    { name: sidecar.name, steps: sidecar.steps },
    { fileRelPath: sidecar.file, helperPath }
  )
  return content === onDisk ? stepLines : null
}

/** The stored map, while the file still has the exact bytes it was made for. */
export function usableStepLines(sidecar: Sidecar, onDisk: string): StepLines | null {
  return sidecar.stepLines?.fileSha256 === sha256Bytes(onDisk) ? sidecar.stepLines : null
}
