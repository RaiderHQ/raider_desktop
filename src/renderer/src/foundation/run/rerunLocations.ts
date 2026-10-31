import type { RunView } from '@foundation/run/runModel'
import type { TestResult } from '@foundation/Types/testResult'

const location = (file: string, line: number | null | undefined): string =>
  line == null ? file : `${file}:${line}`

/** Locations of the last run's failures: from the live run when complete, else from raider-results. */
export function failedLocations(run: RunView | null, results: TestResult[] | null): string[] {
  const fromRun = run ? Object.values(run.tests).filter((t) => t.state === 'failed') : []
  const expected = run?.finished?.counts.failed ?? 0
  const runUsable = fromRun.every((t) => t.file) && (expected === 0 || fromRun.length > 0)

  const pairs: [string, number | null | undefined][] = runUsable
    ? fromRun.map((t) => [t.file, t.line])
    : (results ?? [])
        .filter((r) => r.status === 'failed' && r.file)
        .map((r) => [r.file as string, r.line])

  const bareFiles = new Set(pairs.filter(([, line]) => line == null).map(([file]) => file))
  const locations = pairs
    .filter(([file, line]) => line == null || !bareFiles.has(file))
    .map(([file, line]) => location(file, line))
  return [...new Set(locations)]
}
