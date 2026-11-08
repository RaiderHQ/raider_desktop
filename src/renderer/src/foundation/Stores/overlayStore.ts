import { create } from 'zustand'

/**
 * What a page's own modals tell the main template: the menu bar's commands stand down while
 * one is open, and the page asks for the concepts modal instead of opening a second one.
 */
interface OverlayStore {
  /** A page shows a modal of its own (an install help, the Quick record dialog) */
  pageModalOpen: boolean
  setPageModalOpen: (open: boolean) => void
  /** Bumped to ask the main template for How Ruby Raider works */
  conceptsRequest: number
  requestConcepts: () => void
}

const useOverlayStore = create<OverlayStore>((set) => ({
  pageModalOpen: false,
  setPageModalOpen: (open: boolean): void => set({ pageModalOpen: open }),
  conceptsRequest: 0,
  requestConcepts: (): void => set((state) => ({ conceptsRequest: state.conceptsRequest + 1 }))
}))

export default useOverlayStore
