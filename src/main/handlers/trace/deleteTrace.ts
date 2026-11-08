import { app } from 'electron'
import { safeError } from '../../utils/safeLog'
import { join, relative, isAbsolute } from 'path'
import { rm } from 'fs/promises'
import { existsSync } from 'fs'

// Same rule as saveTrace: a test id names a file and a folder under traces/, nothing else.
// The id can come from a sidecar in the project, which a cloned repository controls.
const SAFE_TEST_ID = /^[A-Za-z0-9_-]+$/

const strictlyInside = (root: string, target: string): boolean => {
  const rel = relative(root, target)
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

export default async (testId: string): Promise<void> => {
  if (typeof testId !== 'string' || !SAFE_TEST_ID.test(testId)) {
    safeError('Refused to delete a trace for an invalid test id')
    return
  }
  const tracesDir = join(app.getPath('userData'), 'traces')
  const jsonPath = join(tracesDir, `${testId}.trace.json`)
  const testTraceDir = join(tracesDir, testId)
  if (!strictlyInside(tracesDir, jsonPath) || !strictlyInside(tracesDir, testTraceDir)) return

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
