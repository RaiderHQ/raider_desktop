import { useEffect } from 'react'
import { useTestsListStore } from '@foundation/Stores/testsListStore'
import type { TestRow } from '@foundation/testKey'
import type { Test } from '@foundation/Types/test'

/**
 * The Tests list rows (null while loading). Loaded when nothing has loaded them yet (or the
 * project changed); after that Main's one tests-updated listener keeps the store fresh.
 */
export const useTestsList = (): TestRow[] | null => {
  const rows = useTestsListStore((s) => s.rows)
  useEffect(() => {
    if (rows === null) void useTestsListStore.getState().reload()
  }, [rows])
  return rows
}

/**
 * The recorded tests with their steps, for what maps a run to a test. Loaded like the list;
 * Main keeps the store fresh while the app is open.
 */
export const useRecordedTests = (): Test[] => {
  const rows = useTestsListStore((s) => s.rows)
  useEffect(() => {
    if (rows === null) void useTestsListStore.getState().reload()
  }, [rows])
  return useTestsListStore((s) => s.tests)
}
