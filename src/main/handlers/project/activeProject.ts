import { resolve } from 'path'
import { appState } from '../appState'
import { activationSettled } from './setActiveProject'

/** Waits for activation, then accepts only the active project's own path */
export async function activeProject(projectPath: unknown): Promise<string | null> {
  await activationSettled()
  if (typeof projectPath !== 'string' || !appState.projectPath) return null
  return resolve(projectPath) === resolve(appState.projectPath) ? appState.projectPath : null
}
