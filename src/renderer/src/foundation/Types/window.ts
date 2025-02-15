import { FileNode } from '@foundation/Types/fileNode'

export interface WindowApi {
  api: {
    selectFolder: (message: string) => Promise<string>
    readDirectory: (folder: string) => Promise<FileNode[]>
    readFile: (filePath: string) => Promise<{ success: boolean; data?: string; fileExt?: string; error?: string }>
    runRubyRaider: (
      folderPath: string,
      projectName: string,
      framework: string,
      automation: string,
      mobile?: string
    ) => Promise<{ success: boolean; output?: string; error?: string }>
    openAllure: () => Promise<{ success: boolean; output?: string; error?: string }>
    editFile: (
      filePath: string,
      newContent: string
    ) => Promise<{ success: boolean; error?: string }>
    runTests: (folderPath: string) => Promise<{ success: boolean; output?: string; error?: string }>
    updateBrowserUrl: (
      projectPath: string,
      url: string
    ) => Promise<{ success: boolean; output?: string; error?: string }>
    updateBrowserType: (
      projectPath: string,
      browser: string
    ) => Promise<{ success: boolean; output?: string; error?: string }>
    isMobileProject: (
      projectPath: string
    ) => Promise<{ success: boolean; isMobileProject?: boolean; error?: string }>
    runCommand: (command: string) => Promise<{ success: boolean; output?: string; error?: string }>
    installRaider: () => Promise<{ success: boolean; output?: string; error?: string }>
  }
}
