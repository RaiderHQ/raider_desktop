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

/** Why 'run-test' / 'run-suite' refused a mobile project; the renderer shows its own copy */
export const MOBILE_NO_LEGACY = 'mobileNoLegacy'

/** Result of the legacy 'run-test' and 'run-suite', which run generated temporary files */
export type LegacyRunResult = { success: boolean; output: string; code?: typeof MOBILE_NO_LEGACY }

/** Appium projects never run generated code: it would be Selenium */
export const mobileNoLegacyResult = (): LegacyRunResult => ({
  success: false,
  output: "Mobile projects can't run recorded tests yet.",
  code: MOBILE_NO_LEGACY
})
