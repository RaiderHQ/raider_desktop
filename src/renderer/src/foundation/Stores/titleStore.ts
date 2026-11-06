import { create } from 'zustand'

interface TitleState {
  document: { name: string; edited: boolean } | null
  setDocument: (doc: TitleState['document']) => void
}

const useTitleStore = create<TitleState>((set) => ({
  document: null,
  setDocument: (document): void => set({ document })
}))

export default useTitleStore
