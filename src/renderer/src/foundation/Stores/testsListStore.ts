import { create } from 'zustand'
import toast from 'react-hot-toast'
import i18n from 'i18next'
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
let latestReload = 0

export const useTestsListStore = create<TestsListStore>(
  (set, get): TestsListStore => ({
    rows: null,
    reload: async (): Promise<void> => {
      // Only the newest reload may write: older ones can resolve late
      const mine = ++latestReload
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
        if (mine === latestReload) set({ rows })
      } catch (error) {
        console.error('Listing the project tests failed:', error)
        if (mine !== latestReload) return
        // A good list stays: an empty one would say the project has no tests
        toast.error(i18n.t('tests.listFailed'), { id: 'tests-list-failed' })
        if (get().rows === null) set({ rows: [] })
      }
    }
  })
)
