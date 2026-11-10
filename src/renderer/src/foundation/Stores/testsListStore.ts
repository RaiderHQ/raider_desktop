import { create } from 'zustand'
import toast from 'react-hot-toast'
import i18n from 'i18next'
import type { Test } from '@foundation/Types/test'
import type { TestRow } from '@foundation/testKey'
import type { ProjectTestEntry } from '@shared/types/projectTest'

interface TestsListStore {
  /** null until the first load finishes */
  rows: TestRow[] | null
  /** The recorded tests with their steps, as main has them (what a failed run is mapped against) */
  tests: Test[]
  reload: () => Promise<void>
  /** main announced the tests (with their steps): keep them, and list the files again */
  applyUpdate: (tests: Test[]) => Promise<void>
}

/**
 * The project's tests as one list: every spec file of the project, recorded or hand-written.
 * Callers that save a recording must reload; save-recording doesn't broadcast to this store.
 */
let latestReload = 0

const toRow = (e: ProjectTestEntry): TestRow => ({
  name: e.name,
  file: e.file,
  testId: e.testId,
  ownership: e.ownership,
  ...(e.missingFile ? { missingFile: true as const } : {}),
  ...(e.kind === 'flow' ? { kind: 'flow' as const } : {}),
  tags: e.tags ?? []
})

export const useTestsListStore = create<TestsListStore>(
  (set, get): TestsListStore => ({
    rows: null,
    tests: [],
    applyUpdate: async (tests): Promise<void> => {
      // Newer than any reload still on its way
      const mine = ++latestReload
      set({ tests })
      try {
        const entries = await window.api.listProjectTests()
        if (mine === latestReload) set({ rows: entries.map(toRow) })
      } catch (error) {
        console.error('Listing the project tests failed:', error)
      }
    },
    reload: async (): Promise<void> => {
      // Only the newest reload may write: older ones can resolve late
      const mine = ++latestReload
      try {
        const [entries, tests] = await Promise.all([
          window.api.listProjectTests(),
          window.api.getTests()
        ])
        const rows = entries.map(toRow)
        if (mine === latestReload) set({ rows, tests })
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
