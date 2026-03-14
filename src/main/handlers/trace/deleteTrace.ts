import { app } from 'electron'
import { safeError } from '../../utils/safeLog'
import { join } from 'path'
import { rm } from 'fs/promises'
import { existsSync } from 'fs'

export default async (testId: string): Promise<void> => {
  const tracesDir = join(app.getPath('userData'), 'traces')
  const jsonPath = join(tracesDir, `${testId}.trace.json`)
  const testTraceDir = join(tracesDir, testId)

  try {
    if (existsSync(jsonPath)) {
      await rm(jsonPath)
    }
    if (existsSync(testTraceDir)) {
      await rm(testTraceDir, { recursive: true })
    }
  } catch (error) {
    safeError(`Failed to delete trace for test ${testId}:`, error)
  }
}
