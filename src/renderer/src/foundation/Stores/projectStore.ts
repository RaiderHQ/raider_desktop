import { create } from 'zustand'
import toast from 'react-hot-toast'
import i18n from 'i18next'
import { subscribeWithSelector } from 'zustand/middleware'
import { FileNode } from '@foundation/Types/fileNode'
import { RaiderConfig } from '@foundation/Types/raiderConfig'
import type { ProjectLayout } from '@shared/types/projectLayout'

interface ProjectStore {
  projectPath: string | null
  projectConfig: RaiderConfig | null
  projectAutomation: string | null
  projectFramework: string | null
  layout: ProjectLayout | null
  files: FileNode[]
  selectedFiles: string[]
  setProjectPath: (path: string) => void
  setProjectAutomation: (automation: string | null) => void
  setProjectFramework: (framework: string | null) => void
  loadFiles: (path: string) => void
  toggleFile: (filePath: string) => void
  toggleAll: (select: boolean) => void
}

const useProjectStore = create(
  subscribeWithSelector<ProjectStore>((set, get) => ({
    projectPath: null,
    projectConfig: null,
    projectAutomation: null,
    projectFramework: null,
    layout: null,
    files: [],
    selectedFiles: [],
    setProjectPath: (path: string): void => {
      // The same path doesn't trigger the subscription, so re-activate directly: this is how
      // a project that failed to load (e.g. after fixing permissions) gets another try
      if (path === get().projectPath) syncActiveProject(path)
      else set({ projectPath: path })
    },
    setProjectAutomation: (automation: string | null): void =>
      set({ projectAutomation: automation }),
    setProjectFramework: (framework: string | null): void => set({ projectFramework: framework }),

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

          filePaths = [...filePaths, ...getFilePaths(file.children || [])]
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
    // The layout belongs to one project, so it never outlives a switch
    useProjectStore.setState({ layout: null })
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

// Main process owns the recorder settings in the project's config, so it must know the open project
const syncActiveProject = (projectPath: string | null): void => {
  window.api
    .setActiveProject(projectPath)
    .then((result) => {
      // Only keep the layout if the project is still the one that was activated
      if (useProjectStore.getState().projectPath === projectPath) {
        useProjectStore.setState({ layout: result.layout ?? null })
      }
      if (!result.success) {
        // Main has closed the project, so nothing is saved until it opens cleanly
        toast.error(i18n.t('project.activationFailed', { error: result.error }), {
          duration: 10000
        })
      }
    })
    .catch((error: unknown) => {
      if (useProjectStore.getState().projectPath === projectPath) {
        useProjectStore.setState({ layout: null })
      }
      console.error('Error setting active project:', error)
    })
}

useProjectStore.subscribe((state) => state.projectPath, syncActiveProject)

const initialProjectPath = useProjectStore.getState().projectPath
if (initialProjectPath) {
  syncActiveProject(initialProjectPath)
}

export default useProjectStore
