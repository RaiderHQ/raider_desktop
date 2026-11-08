import { create } from 'zustand'

/** An entry copied in the Files tab, waiting to be pasted. Paths are project-relative. */
export interface CopiedEntry {
  projectPath: string
  rel: string
  name: string
  kind: 'file' | 'folder'
}

interface FileClipboardStore {
  copied: CopiedEntry | null
  copy: (entry: CopiedEntry) => void
  clear: () => void
  /** Drops the copied entry when `rel` (or a folder holding it) is gone from `projectPath` */
  forget: (projectPath: string, rel: string) => void
  /** Follows a rename of the copied entry, or of a folder holding it */
  renamed: (projectPath: string, fromRel: string, toRel: string) => void
}

/** The app's own clipboard for files and folders; the system clipboard is left alone. */
const useFileClipboardStore = create<FileClipboardStore>((set, get) => ({
  copied: null,
  copy: (entry): void => set({ copied: entry }),
  clear: (): void => set({ copied: null }),
  forget: (projectPath, rel): void => {
    const copied = get().copied
    if (
      copied &&
      copied.projectPath === projectPath &&
      (copied.rel === rel || copied.rel.startsWith(rel + '/'))
    )
      set({ copied: null })
  },
  renamed: (projectPath, fromRel, toRel): void => {
    const copied = get().copied
    if (!copied || copied.projectPath !== projectPath) return
    if (copied.rel === fromRel)
      set({ copied: { ...copied, rel: toRel, name: toRel.split('/').pop() ?? copied.name } })
    else if (copied.rel.startsWith(fromRel + '/'))
      set({ copied: { ...copied, rel: toRel + copied.rel.slice(fromRel.length) } })
  }
}))

/** What can be pasted into `projectPath`: only an entry copied from that same project. */
export const copiedIn = (
  state: Pick<FileClipboardStore, 'copied'>,
  projectPath: string | null
): CopiedEntry | null =>
  state.copied && state.copied.projectPath === projectPath ? state.copied : null

export default useFileClipboardStore
