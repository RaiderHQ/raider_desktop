import { app } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { appState } from './appState'
import { activationSettled } from './project/setActiveProject'
import type { Test } from '@foundation/Types/test'

/** 'get-tests': the active project's recorded tests, with their steps. */
export default async (): Promise<Test[]> => {
  // Wait for a project switch to finish, so the previous project's tests are never shown
  await activationSettled()
  const tracesDir = join(app.getPath('userData'), 'traces')
  const tests = Array.from(appState.tests.values())
  for (const test of tests) {
    if (!test.hasTrace && existsSync(join(tracesDir, `${test.id}.trace.json`))) {
      test.hasTrace = true
    }
  }
  return tests
}
