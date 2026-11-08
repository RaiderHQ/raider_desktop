import { app } from 'electron'
import { safeError } from '../../utils/safeLog'
import { join, relative, isAbsolute } from 'path'
import { rm } from 'fs/promises'
import { existsSync } from 'fs'
import { isSafeTraceId } from './traceId'


const strictlyInside = (root: string, target: string): boolean => {
  const rel = relative(root, target)
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

export default async (testId: string): Promise<void> => {
  if (!isSafeTraceId(testId)) {
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
