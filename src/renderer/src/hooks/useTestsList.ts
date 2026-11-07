import { useEffect } from 'react'
import { useTestsListStore } from '@foundation/Stores/testsListStore'
import type { TestRow } from '@foundation/testKey'
import type { Test } from '@foundation/Types/test'

/** The Tests list rows (null while loading), kept fresh on mount and on tests-updated. */
export const useTestsList = (): TestRow[] | null => {
  const rows = useTestsListStore((s) => s.rows)
  useEffect(() => {
    const reload = useTestsListStore.getState().reload
    reload()
    const off = window.api.onTestsUpdated(() => {
      reload()
    })
    return (): void => off()
  }, [])
  return rows
}

/**
 * The recorded tests with their steps, for what maps a run to a test. Loaded when the caller
 * mounts; Main keeps the store fresh while the app is open (see the tests-updated listener there).
 */
export const useRecordedTests = (): Test[] => {
  useEffect(() => {
    void useTestsListStore.getState().reload()
  }, [])
  return useTestsListStore((s) => s.tests)
}
