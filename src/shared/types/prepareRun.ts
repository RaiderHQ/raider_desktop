/** Result of 'prepare-test-run': the spec file to run live, or why it can't be run */
export type PrepareTestRunResult =
  | { mode: 'files'; file: string }
  | { mode: 'legacy' }
  | { error: string }

/** Result of 'prepare-suite-run'; `skipped` lists code-owned files that are gone */
export type PrepareSuiteRunResult =
  | { mode: 'files'; files: string[]; skipped: string[] }
  | { mode: 'legacy' }
  | { error: string }
