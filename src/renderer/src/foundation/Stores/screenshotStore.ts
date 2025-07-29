import { create } from 'zustand'

interface ScreenshotStore {
  screenshotPaths: string[]
  addScreenshotPath: (path: string) => void
  clearScreenshotPaths: () => void
}

const useScreenshotStore = create<ScreenshotStore>(
  (set): ScreenshotStore => ({
    screenshotPaths: [],
    addScreenshotPath: (path: string): void =>
      set((state: { screenshotPaths: string[] }): { screenshotPaths: string[] } => ({
        screenshotPaths: [...state.screenshotPaths, path]
      })),
    clearScreenshotPaths: (): void => set({ screenshotPaths: [] })
  })
)

export default useScreenshotStore
