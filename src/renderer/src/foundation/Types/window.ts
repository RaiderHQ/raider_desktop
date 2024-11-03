export interface WindowApi {
  api: {
    selectFolder: (message: string) => Promise<string>
    createSettingsFile: (
      folder: string,
      data: Record<string, unknown>
    ) => Promise<{ success: boolean; filePath?: string; error?: string }>
  }
}
