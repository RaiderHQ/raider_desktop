import { create } from 'zustand'

export interface EditorStore {
  /** The file editor page has edits that are not on disk */
  pageDirty: boolean
  /** The Files tab's inline editor has edits that are not on disk */
  inlineDirty: boolean
  setPageDirty: (dirty: boolean) => void
  setInlineDirty: (dirty: boolean) => void
}

/**
 * Whether a file editor holds unsaved edits, so the app-wide menu commands that would
 * navigate away (and drop them) can stand down. The editors themselves own the prompts.
 */
export const useEditorStore = create<EditorStore>((set) => ({
  pageDirty: false,
  inlineDirty: false,
  setPageDirty: (pageDirty: boolean): void => set({ pageDirty }),
  setInlineDirty: (inlineDirty: boolean): void => set({ inlineDirty })
}))

export default useEditorStore
