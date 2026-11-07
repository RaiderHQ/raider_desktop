import { useEffect } from 'react'
import useRecorderStore from '@foundation/Stores/recorderStore'
import type { Test } from '@foundation/Types/test'

/**
 * `live` with the fields only main knows (who owns the file, where it is, whether
 * a trace is saved). Returns `live` itself when nothing changed, so an echo never
 * triggers another autosave.
 */
function withServerFields(live: Test, saved: Test): Test {
  const hasTrace = live.hasTrace || saved.hasTrace
  if (
    live.ownership === saved.ownership &&
    live.file === saved.file &&
    !!live.hasTrace === !!hasTrace
  ) {
    return live
  }
  const merged: Test = { ...live }
  if (saved.ownership) merged.ownership = saved.ownership
  else delete merged.ownership
  if (saved.file) merged.file = saved.file
  else delete merged.file
  if (hasTrace) merged.hasTrace = true
  return merged
}

/**
 * Keeps the open test in step with what main saved: when main announces the tests, the open
 * (saved) test takes the fields only main knows. The echo of a save is older than what is on
 * screen, so steps recorded while it was in flight, and the trace main never sees, must survive it.
 */
export function useTestsSync(): void {
  useEffect(
    () =>
      window.api.onTestsUpdated((updated: Test[]) => {
        const { activeTest, activeTestSaved, updateActiveTest } = useRecorderStore.getState()
        if (!activeTestSaved || !activeTest) return
        const now = updated.find((t) => t.id === activeTest.id)
        if (!now) {
          // Gone from the project (deleted, or its file removed): the editor keeps what is on
          // screen, but the next edit must not write it back as a new file
          useRecorderStore.getState().setActiveTestSaved(false)
          return
        }
        updateActiveTest((live) =>
          live && live.id === now.id ? withServerFields(live, now) : live
        )
      }),
    []
  )
}
