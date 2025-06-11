import { randomUUID } from 'crypto' // <-- The fix is to add this import
import type { BrowserWindow } from 'electron'

export interface Test {
  id: string;
  name: string;
  url: string;
  steps: string[];
}
export interface Suite {
  id: string;
  name: string;
  tests: Test[];
}
export interface AppState {
  suites: Map<string, Suite>;
  projectBaseUrl: string; // Keep this if other parts of your app use it
}

const createSuite = (
  appState: AppState,
  mainWindow: BrowserWindow | null,
  suiteName: string
): { success: boolean; suite?: Suite; error?: string } => {
  if (!suiteName || Array.from(appState.suites.values()).some((s) => s.name === suiteName)) {
    return { success: false, error: 'A suite with this name already exists.' }
  }

  // Now `randomUUID` is defined because of the import
  const newSuite: Suite = { id: randomUUID(), name: suiteName, tests: [] }
  appState.suites.set(newSuite.id, newSuite)

  // Notify the UI that the suite list has changed
  mainWindow?.webContents.send('suite-updated', Array.from(appState.suites.values()))

  return { success: true, suite: newSuite }
}

export default createSuite
