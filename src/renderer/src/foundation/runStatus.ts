/**
 * The pass/fail badge for a run. A run main reported as failed is failed even
 * when rspec's summary says "0 failures" (a load error stops it before any example).
 */
export function runStatusOf(runOutput: string, runFailed: boolean): 'pass' | 'fail' | null {
  if (!runOutput || runOutput.startsWith('Running')) return null
  if (runFailed) return 'fail'
  if (/0 failures?/i.test(runOutput) || /\bpassed\b/i.test(runOutput)) return 'pass'
  if (/\d+ failures?/i.test(runOutput) || /\bfailed\b/i.test(runOutput)) return 'fail'
  return null
}
