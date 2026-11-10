import { listProjectTests } from './listProjectTests'
import { listSidecars } from './sidecar'
import { flowStemOf } from '../../../shared/flows'
import { safeError } from '../../utils/safeLog'
import type { ProjectLayout } from '../../../shared/types/projectLayout'
import type { FlowInput, ProjectFlowEntry } from '../../../shared/types/projectTest'

/** The recorded inputs of each flow file, by its path */
async function inputsByFile(projectPath: string): Promise<Map<string, FlowInput[]>> {
  const inputs = new Map<string, FlowInput[]>()
  try {
    for (const { fileRel, sidecar } of await listSidecars(projectPath)) {
      if (sidecar && sidecar.file === fileRel && flowStemOf(fileRel)) {
        inputs.set(fileRel, sidecar.inputs ?? [])
      }
    }
  } catch (error) {
    safeError('Could not read the flow records:', error)
  }
  return inputs
}

/**
 * The project's flows (`flows/<name>_flow.rb`), recorded or hand-written: the flow entries
 * of listProjectTests, with the stem `raider flow` runs them by and their inputs.
 */
export async function listProjectFlows(
  projectPath: string,
  layout: ProjectLayout
): Promise<ProjectFlowEntry[]> {
  const entries = (await listProjectTests(projectPath, layout)).filter((e) => e.kind === 'flow')
  const inputs = await inputsByFile(projectPath)
  const flows: ProjectFlowEntry[] = []
  for (const entry of entries) {
    const stem = flowStemOf(entry.file)
    if (!stem) continue
    flows.push({
      name: entry.name,
      file: entry.file,
      stem,
      ownership: entry.ownership,
      ...(entry.testId && { testId: entry.testId }),
      inputs: entry.ownership === 'recorded' ? (inputs.get(entry.file) ?? []) : [],
      ...(entry.missingFile && { missingFile: true as const })
    })
  }
  return flows
}
