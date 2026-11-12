import { create } from 'zustand'
import useProjectStore from '@foundation/Stores/projectStore'

const NONE: string[] = []

interface TickedTestsStore {
  /** Ticked spec files (relative paths, as the Tests list has them) per project path */
  byProject: Record<string, string[]>
  /** The project's ticked files, in the order they were ticked */
  ticked: (projectPath: string) => string[]
  toggle: (projectPath: string, file: string) => void
  /** Ticks (on) or unticks every file of a range */
  setRange: (projectPath: string, files: string[], on: boolean) => void
  clear: (projectPath: string) => void
  /** Drops the ticks of files no longer in the list */
  prune: (projectPath: string, listedFiles: string[]) => void
}

/** The tests ticked in the Tests list's Select mode, to run or schedule together. */
export const useTickedTestsStore = create<TickedTestsStore>((set, get) => {
  const put = (projectPath: string, files: string[]): void =>
    set((s) => ({ byProject: { ...s.byProject, [projectPath]: files } }))
  return {
    byProject: {},
    ticked: (projectPath): string[] => get().byProject[projectPath] ?? NONE,
    toggle: (projectPath, file): void => {
      const files = get().ticked(projectPath)
      put(projectPath, files.includes(file) ? files.filter((f) => f !== file) : [...files, file])
    },
    setRange: (projectPath, range, on): void => {
      const files = get().ticked(projectPath)
      put(
        projectPath,
        on
          ? [...files, ...range.filter((f, i) => !files.includes(f) && range.indexOf(f) === i)]
          : files.filter((f) => !range.includes(f))
      )
    },
    clear: (projectPath): void => put(projectPath, NONE),
    prune: (projectPath, listedFiles): void => {
      const files = get().ticked(projectPath)
      const listed = new Set(listedFiles)
      const kept = files.filter((f) => listed.has(f))
      if (kept.length !== files.length) put(projectPath, kept)
    }
  }
})

// Ticks belong to the open project: switching projects drops them all
useProjectStore.subscribe(
  (s) => s.projectPath,
  () => useTickedTestsStore.setState({ byProject: {} })
)
