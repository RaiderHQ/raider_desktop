import { create } from 'zustand'
import type { Test } from '@foundation/Types/test'

/**
 * A test copied from the Tests list. Recorded: the saved test (pasted as a new one). Code: the
 * file's text as main read it, and where it came from (pasted as a new file next to it).
 */
export type ClipboardTest =
  | { kind: 'recorded'; test: Test }
  | { kind: 'code'; name: string; fileText: string; relFile: string }

interface TestClipboardStore {
  item: ClipboardTest | null
  setItem: (item: ClipboardTest | null) => void
}

/** The app's own clipboard for tests (not the OS one); it outlives a project switch. */
export const useTestClipboardStore = create<TestClipboardStore>((set) => ({
  item: null,
  setItem: (item): void => set({ item })
}))
