import { shell } from 'electron'
import fs from 'fs'
import path from 'path'

const reportFile = (projectPath: string): string =>
  path.join(projectPath, 'raider-results', 'index.html')

export const reportExists = async (projectPath: string): Promise<boolean> => {
  if (!projectPath) return false
  try {
    return (await fs.promises.stat(reportFile(projectPath))).isFile()
  } catch {
    return false
  }
}

export const openReport = async (
  projectPath: string
): Promise<{ success: boolean; error?: string }> => {
  if (!(await reportExists(projectPath))) {
    return { success: false, error: 'No report yet — run the tests first' }
  }
  const error = await shell.openPath(reportFile(projectPath))
  return error ? { success: false, error } : { success: true }
}
