import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { FileNode } from '@foundation/Types/fileNode'
import { RaiderConfig } from '@foundation/Types/raiderConfig'

interface ProjectStore {
  projectPath: string | null
  projectConfig: RaiderConfig | null
  files: FileNode[]
  selectedFiles: string[]
  setProjectPath: (path: string) => void
  loadFiles: (path: string) => void
  toggleFile: (filePath: string) => void
  toggleAll: (select: boolean) => void
}

const useProjectStore = create(
  subscribeWithSelector<ProjectStore>((set, get) => ({
    projectPath: null,
    projectConfig: null,
    files: [],
    selectedFiles: [],
    setProjectPath: (path: string): void => set({ projectPath: path }),

    loadFiles: async (path: string): Promise<void> => {
      try {
        const files = await window.api.readDirectory(path)
        set({ files })
      } catch (error) {
        console.error('Error loading files:', error)
        set({ files: [] })
      }
    },

    toggleFile: (filePath: string): void => {
      const { selectedFiles } = get()
      const isSelected = selectedFiles.includes(filePath)

      const newSelectedFiles = isSelected
        ? selectedFiles.filter((file) => file !== filePath)
        : [...selectedFiles, filePath]

      set({ selectedFiles: newSelectedFiles })
    },

    toggleAll: (select: boolean): void => {
      if (!select) {
        set({ selectedFiles: [] })
        return
      }

      const { files } = get()

      const getFilePaths = (files: FileNode[]): string[] => {
        let filePaths: string[] = []

        files.forEach((file) => {
          if (file.type === 'file') {
            filePaths.push(file.path)
            return
          }

          filePaths = [...filePaths, ...getFilePaths(file.children)]
        })

        return filePaths
      }

      const filePaths = getFilePaths(files)
      set({ selectedFiles: filePaths })
    }
  }))
)

useProjectStore.subscribe(
  (state) => state.projectPath,
  (projectPath) => {
    if (projectPath) {
      return
    }

    useProjectStore.setState({ projectConfig: null })
  }
)

useProjectStore.subscribe(
  (state) => state.projectPath,
  (projectPath) => {
    if (projectPath) {
      useProjectStore.getState().loadFiles(projectPath)
      return
    }

    useProjectStore.setState({ files: [] })
  }
)

export default useProjectStore
