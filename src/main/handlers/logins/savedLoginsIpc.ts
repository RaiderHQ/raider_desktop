import { appState } from '../appState'
import { activationSettled } from '../project/setActiveProject'
import { listSavedLogins, forgetSavedLogin } from './savedLogins'
import type { SavedLoginsResult } from '@shared/types/savedLogins'

/** 'list-saved-logins': the active project's saved logins, once activation has finished. */
export async function listSavedLoginsHandler(): Promise<SavedLoginsResult> {
  await activationSettled()
  const { projectPath } = appState
  return projectPath ? listSavedLogins(projectPath) : { logins: [], gemSupportsLogins: false }
}

/** 'forget-saved-login' */
export async function forgetSavedLoginHandler(
  name: unknown
): Promise<{ ok: true } | { error: string }> {
  await activationSettled()
  const { projectPath } = appState
  return projectPath ? forgetSavedLogin(projectPath, name) : { error: 'No project is open.' }
}
