import { app } from 'electron'
import { join } from 'path'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import type { TraceStep } from '@foundation/Types/traceStep'

export default async (
  testId: string
): Promise<{ success: boolean; trace?: TraceStep[] }> => {
  try {
    const jsonPath = join(app.getPath('userData'), 'traces', `${testId}.trace.json`)

    if (!existsSync(jsonPath)) {
      return { success: false }
    }

    const content = await readFile(jsonPath, 'utf-8')
    const trace: TraceStep[] = JSON.parse(content)

    return { success: true, trace }
  } catch {
    return { success: false }
  }
}
