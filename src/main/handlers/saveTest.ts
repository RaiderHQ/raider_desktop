import { randomUUID } from 'crypto';
import { appState } from './appState';
import { BrowserWindow } from 'electron';

interface Test {
  id: string;
  name: string;
  url: string;
  steps: string[];
}
interface Suite {
  id: string;
  name: string;
  tests: Test[];
}

export default (mainWindow: BrowserWindow | null, _event: Electron.IpcMainEvent, { suiteId, testData }: { suiteId: string, testData: Test }) => {
  const suite = appState.suites.get(suiteId)
  if (!suite) {
    return { success: false, error: 'Suite not found' }
  }
  const testIndex = suite.tests.findIndex(t => t.id === testData.id);
  if (testIndex !== -1) {
    suite.tests[testIndex] = testData; // Update existing test
  } else {
    suite.tests.push({ ...testData, id: randomUUID() })
  }
  mainWindow?.webContents.send('suite-updated', Array.from(appState.suites.values()))
  return { success: true };
};
