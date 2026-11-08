/** Result of 'prepare-test-run': the spec file to run live, or why it can't be run */
export type PrepareTestRunResult =
  | { mode: 'files'; file: string }
  | { mode: 'legacy' }
  | { error: string }

/** Result of the legacy 'run-test', which runs generated temporary files */
export type LegacyRunResult = { success: boolean; output: string }
