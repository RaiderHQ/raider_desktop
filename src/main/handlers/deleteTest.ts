import { appState } from './appState'
import { BrowserWindow } from 'electron'

export default async (mainWindow: BrowserWindow | null, _event: Electron.IpcMainEvent, { suiteId, testId }: { suiteId: string, testId: string }) => {
  const suite = appState.suites.get(suiteId)

  if (!suite) {
    console.error(`Error: Attempted to delete test from a non-existent suite (ID: ${suiteId}).`)
    return { success: false, error: `Suite with ID ${suiteId} not found.` }
  }

  const initialTestCount = suite.tests.length
  suite.tests = suite.tests.filter(test => test.id !== testId);

  if (suite.tests.length === initialTestCount) {
    console.warn(`Warning: Test with ID ${testId} was not found in suite "${suite.name}".`)
  }

  mainWindow?.webContents.send('suite-updated', Array.from(appState.suites.values()))

  return { success: true }
};
