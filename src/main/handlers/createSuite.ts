import { randomUUID } from 'crypto'
import { appState } from './appState'
import { BrowserWindow } from 'electron'
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
  if (!suiteName || Array.from(appState.suites.values()).some((s) => s.name === suiteName)) {
    return { success: false, error: 'A suite with this name already exists.' }
  }
  const newSuite: Suite = { id: randomUUID(), name: suiteName, tests: [] }
  appState.suites.set(newSuite.id, newSuite)
  mainWindow?.webContents.send('suite-updated', Array.from(appState.suites.values()))
  return { success: true, suite: newSuite }
}
