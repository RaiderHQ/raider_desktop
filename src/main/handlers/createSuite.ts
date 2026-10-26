import { randomUUID } from 'crypto'
import { appState } from './appState'
import { BrowserWindow } from 'electron'
import { persistActiveSuites } from './suitePersistence'
import { activeSuiteMode, filesStore, LOCKED_ERROR, saveIndex } from './tests/suiteStore'
import type { Suite } from '@foundation/Types/suite'

type SuiteResult = {
  success: boolean
  suite?: Suite
  error?: string
}

export default async (
  mainWindow: BrowserWindow | null,
  suiteName: string
): Promise<SuiteResult> => {
  const mode = await activeSuiteMode()
  if (mode === 'locked') return { success: false, error: LOCKED_ERROR }
  if (!suiteName || Array.from(appState.suites.values()).some((s) => s.name === suiteName)) {
    return { success: false, error: 'A suite with this name already exists.' }
  }
  const newSuite: Suite = { id: randomUUID(), name: suiteName, tests: [] }

  const store = filesStore()
  if (store) {
    store.index.set(newSuite.id, { id: newSuite.id, name: suiteName, testIds: [] })
    try {
      await saveIndex(store)
    } catch (error) {
      store.index.delete(newSuite.id)
      return { success: false, error: (error as Error).message }
    }
    store.suites.set(newSuite.id, newSuite)
  } else {
    appState.suites.set(newSuite.id, newSuite)
    await persistActiveSuites()
  }
  mainWindow?.webContents.send('suite-updated', Array.from(appState.suites.values()))
  return { success: true, suite: newSuite }
}
