import { useEffect } from 'react'
import useTitleStore from '@foundation/Stores/titleStore'

/** Sets the window's document while mounted; clears it on unmount or when name becomes null */
export function useDocumentTitle(name: string | null, edited: boolean): void {
  useEffect(() => {
    if (name === null) return
    useTitleStore.getState().setDocument({ name, edited })
    return (): void => useTitleStore.getState().setDocument(null)
  }, [name, edited])
}
