import { FileNode } from '@foundation/Types/fileNode'

export interface WindowApi {
  api: {
    selectFolder: (message: string) => Promise<string>
    createSettingsFile: (
      folder: string,
      data: Record<string, unknown>
    ) => Promise<{ success: boolean; filePath?: string; error?: string }>
    readDirectory: (folder: string) => Promise<FileNode[]>
    readFile: (file: string) => Promise<string>
    checkConfig: (
      folderPath: string
    ) => Promise<{ success: boolean; filePath?: string; error?: string }>
    runRubyRaider: (
      projectName: string
    ) => Promise<{ success: boolean; output?: string; error?: string }>
  }
}
