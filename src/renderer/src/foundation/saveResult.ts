import toast from 'react-hot-toast'
import useRecorderStore from '@foundation/Stores/recorderStore'
import type { Test } from '@foundation/Types/test'

type Translate = (key: string) => string

/**
 * Reacts to the result of saving a test. A test that is now owned by code switches to
 * read-only; any other failure shows one plain message and logs the details.
 * Returns true when the save went through.
 */
export function handleSaveResult(
  result: { success: boolean; error?: string } | undefined,
  testId: string,
  t: Translate
): boolean {
  if (!result || result.success) return true
  if (result.error === 'codeOwned') {
    // Only flips the test the save was for; the user may have moved on since
    useRecorderStore
      .getState()
      .updateActiveTest((prev: Test | null) =>
        prev && prev.id === testId && prev.ownership !== 'codeOwnedWasRecorded'
          ? { ...prev, ownership: 'codeOwnedWasRecorded' }
          : prev
      )
    return false
  }
  console.error('Saving the test failed:', result.error)
  // One id, so repeated failures don't pile up toasts
  toast.error(t('recorder.saveFailed'), { id: 'save-failed' })
  return false
}
