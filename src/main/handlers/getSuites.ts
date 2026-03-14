import { app } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { appState } from './appState'
import type { Suite } from '@foundation/Types/suite'

export default (): Suite[] => {
  const tracesDir = join(app.getPath('userData'), 'traces')
  const suites = Array.from(appState.suites.values())
  for (const suite of suites) {
    for (const test of suite.tests) {
      if (!test.hasTrace) {
        const jsonPath = join(tracesDir, `${test.id}.trace.json`)
        if (existsSync(jsonPath)) {
          test.hasTrace = true
        }
      }
    }
  }
  return suites
}
