import { appState } from './appState'
import { BrowserWindow } from 'electron'
import { persistActiveSuites } from './suitePersistence'
import { safeError } from '../utils/safeLog'
import { activeSuiteMode, filesStore, releaseTests, saveIndex } from './tests/suiteStore'

export default async (
  mainWindow: BrowserWindow | null,
  suiteId: string
): Promise<{ success: boolean }> => {
  const mode = await activeSuiteMode()
  if (mode === 'locked') return { success: false }

  const store = filesStore()
  if (store) {
    const entry = store.index.get(suiteId)
    if (!entry) return { success: false }
    const before = Array.from(store.index.entries())
    store.index.delete(suiteId)
    try {
      // Index first: if deleting a file fails later, the test is only unlisted, never dangling
      await saveIndex(store)
    } catch (error) {
      // Put it back in its place
      store.index.clear()
      before.forEach(([id, kept]) => store.index.set(id, kept))
      safeError('Could not delete the suite:', error)
      return { success: false }
    }
    store.suites.delete(suiteId)
    // Tests still listed in another suite, or edited in code, keep their files
    await releaseTests(store, entry.testIds)
    mainWindow?.webContents.send('suite-updated', Array.from(appState.suites.values()))
    return { success: true }
  }

  const success = appState.suites.delete(suiteId)
  if (success) {
    await persistActiveSuites()
    mainWindow?.webContents.send('suite-updated', Array.from(appState.suites.values()))
  }
  return { success }
}
