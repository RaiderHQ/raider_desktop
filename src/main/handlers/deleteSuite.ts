import type { BrowserWindow } from 'electron';
import type { AppState } from './createSuite'; // Reuse types

export const deleteSuite = (
  appState: AppState,
  mainWindow: BrowserWindow | null,
  suiteId: string
): { success: boolean } => {
  const success = appState.suites.delete(suiteId);
  if (success) {
    mainWindow?.webContents.send('suite-updated', Array.from(appState.suites.values()));
  }
  return { success };
};

export default deleteSuite
