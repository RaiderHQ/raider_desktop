import { FileNode } from '@foundation/Types/fileNode'

export interface WindowApi {
  api: {
    selectFolder: (message: string) => Promise<string>
    readDirectory: (folder: string) => Promise<FileNode[]>
    readFiles: (filePath: string) => Promise<{ success: boolean; data?: string; fileExt?: string; error?: string }>
    checkConfig: (
      folderPath: string
    ) => Promise<{ success: boolean; filePath?: string; error?: string }>
    runRubyRaider: (
      folderPath: string,
      projectName: string,
      framework: string,
      automation: string
    ) => Promise<{ success: boolean; output?: string; error?: string }>
  }
}
