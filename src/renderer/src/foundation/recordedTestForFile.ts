import { testKeyOf, toRouteParam } from '@foundation/testKey'
import type { Test } from '@foundation/Types/test'

const stripDot = (file: string): string => file.replace(/^\.\//, '')

/** The recorded test whose project file is this one, if any. */
export function recordedTestForFile(tests: Test[], file: string | undefined): Test | undefined {
  if (!file) return undefined
  const wanted = stripDot(file)
  return tests.find(
    (test) => test.ownership === 'recorded' && !!test.file && stripDot(test.file) === wanted
  )
}

/** The test page of a recorded test. */
export const fixInTestRoute = (testId: string): string =>
  `/overview/tests/${toRouteParam(testKeyOf({ name: '', testId, ownership: 'recorded', tags: [] }))}`
