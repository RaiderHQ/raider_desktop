import type { Suite } from '@foundation/Types/suite'
import { testKeyOf, toRouteParam } from '@foundation/testKey'
import type { Test } from '@foundation/Types/test'

const stripDot = (file: string): string => file.replace(/^\.\//, '')

/** The recorded test whose project file is this one, if any. */
export function recordedTestForFile(suites: Suite[], file: string | undefined): Test | undefined {
  if (!file) return undefined
  const wanted = stripDot(file)
  for (const suite of suites) {
    const found = suite.tests.find(
      (test) => test.ownership === 'recorded' && !!test.file && stripDot(test.file) === wanted
    )
    if (found) return found
  }
  return undefined
}

/** The test page of a recorded test. */
export const fixInTestRoute = (testId: string): string =>
  `/overview/tests/${toRouteParam(testKeyOf({ name: '', testId, ownership: 'recorded', suiteIds: [] }))}`
