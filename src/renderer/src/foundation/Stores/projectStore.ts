import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { SETTINGS_FILE } from '@foundation/Constants'
import { RaiderConfig } from '@foundation/Types/raiderConfig'

interface ProjectStore {
  projectPath: string | null
  projectConfig: RaiderConfig | null
  setProjectPath: (path: string) => void
  loadProjectConfig: (path: string) => void
}

const useProjectStore = create(
  subscribeWithSelector<ProjectStore>((set) => ({
    projectPath: null,
    projectConfig: null,
    setProjectPath: (path: string): void => set({ projectPath: path }),

    loadProjectConfig: async (path: string): Promise<void> => {
      try {
        const configPath = `${path}/${SETTINGS_FILE}`
        const config = await window.api.readFile(configPath)
        const configData = JSON.parse(config)
        set({ projectConfig: configData })
      } catch (error) {
        console.error('Error loading project config:', error)
        set({ projectConfig: null })
      }
    }
  }))
)

useProjectStore.subscribe(
  (state) => state.projectPath,
  (projectPath) => {
    if (projectPath) {
      useProjectStore.getState().loadProjectConfig(projectPath)
      return
    }

    useProjectStore.setState({ projectConfig: null })
  }
)

export default useProjectStore
