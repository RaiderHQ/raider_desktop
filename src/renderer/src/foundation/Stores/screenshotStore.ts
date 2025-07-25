import { create } from 'zustand'

interface ScreenshotStore {
  screenshotPaths: string[]
  addScreenshotPath: (path: string) => void
  clearScreenshotPaths: () => void
}

const useScreenshotStore = create<ScreenshotStore>((set) => ({
  screenshotPaths: [],
  addScreenshotPath: (path) =>
    set((state) => ({ screenshotPaths: [...state.screenshotPaths, path] })),
  clearScreenshotPaths: () => set({ screenshotPaths: [] })
}))

export default useScreenshotStore
