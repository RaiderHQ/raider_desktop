/**
 * Export file settings per framework.
 *
 * Recorded steps are structured (shared/types/step.ts); their Ruby comes from
 * codegen/steps.ts and run/export test files from codegen/testFile.ts.
 */

/**
 * Returns the file extension for export. Every framework exports an RSpec
 * `.rb` file until Cucumber feature generation lands.
 */
export function getExportExtension(_framework: string | null): string {
  return 'rb'
}

/**
 * Returns the file filter for save dialogs.
 */
export function getExportFilters(
  _framework: string | null
): { name: string; extensions: string[] }[] {
  return [
    { name: 'Ruby Scripts', extensions: ['rb'] },
    { name: 'All Files', extensions: ['*'] }
  ]
}
