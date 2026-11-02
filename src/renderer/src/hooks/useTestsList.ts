import { useEffect } from 'react'
import { useTestsListStore } from '@foundation/Stores/testsListStore'
import type { TestRow } from '@foundation/testKey'

/** The Tests list rows (null while loading), kept fresh on mount and on suite-updated. */
export const useTestsList = (): TestRow[] | null => {
  const rows = useTestsListStore((s) => s.rows)
  useEffect(() => {
    const reload = useTestsListStore.getState().reload
    reload()
    const off = window.api.onSuiteUpdated(() => {
      reload()
    })
    return (): void => off()
  }, [])
  return rows
}
