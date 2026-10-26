import { appState } from './appState'
import { BrowserWindow } from 'electron'
import { persistActiveSuites } from './suitePersistence'

export default async (
  mainWindow: BrowserWindow | null,
  suiteId: string
): Promise<{ success: boolean }> => {
  const success = appState.suites.delete(suiteId)
  if (success) {
    await persistActiveSuites()
    mainWindow?.webContents.send('suite-updated', Array.from(appState.suites.values()))
  }
  return { success }
}
