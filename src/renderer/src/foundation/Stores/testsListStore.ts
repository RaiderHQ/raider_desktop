import { create } from 'zustand'
import type { TestRow } from '@foundation/testKey'

interface TestsListStore {
  /** null until the first load finishes */
  rows: TestRow[] | null
  reload: () => Promise<void>
}

/**
 * The project's tests as one list: project files plus suite tests that have no file
 * ('legacy'). Callers that save a recording must reload; save-recording doesn't broadcast.
 */
export const useTestsListStore = create<TestsListStore>(
  (set): TestsListStore => ({
    rows: null,
    reload: async (): Promise<void> => {
      try {
        const [entries, suites] = await Promise.all([
          window.api.listProjectTests(),
          window.api.getSuites()
        ])
        const suiteIdsOf = (testId?: string): string[] =>
          testId ? suites.filter((s) => s.tests.some((x) => x.id === testId)).map((s) => s.id) : []
        const rows: TestRow[] = entries.map((e) => ({
          name: e.name,
          file: e.file,
          testId: e.testId,
          ownership: e.ownership,
          ...(e.missingFile ? { missingFile: true as const } : {}),
          suiteIds: suiteIdsOf(e.testId)
        }))
        const seen = new Set(rows.map((r) => r.testId).filter(Boolean))
        for (const suite of suites) {
          for (const test of suite.tests) {
            if (test.file || seen.has(test.id)) continue
            seen.add(test.id)
            rows.push({
              name: test.name,
              testId: test.id,
              ownership: 'legacy',
              suiteIds: suiteIdsOf(test.id)
            })
          }
        }
        set({ rows })
      } catch (error) {
        console.error('Listing the project tests failed:', error)
        set({ rows: [] })
      }
    }
  })
)
