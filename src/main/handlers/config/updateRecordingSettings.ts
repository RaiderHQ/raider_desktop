import { appState } from '../appState'
import { writeRecorderSettings } from './projectSettings'
import type { RecorderSettings } from '@shared/types/recorderSettings'

type SettingsPatch = Partial<
  Pick<RecorderSettings, 'implicitWait' | 'explicitWait' | 'selectorPriority'>
>

// The waits end up in generated Ruby (Raider.timeout = N), so only finite numbers are kept
const isWait = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0
const isPriority = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((p) => typeof p === 'string')

/** The patch with only the fields a renderer may set, each of the right shape; null if any is wrong. */
export function validSettingsPatch(patch: unknown): SettingsPatch | null {
  if (typeof patch !== 'object' || patch === null) return null
  const p = patch as Record<string, unknown>
  const out: SettingsPatch = {}
  if ('implicitWait' in p) {
    if (!isWait(p.implicitWait)) return null
    out.implicitWait = p.implicitWait
  }
  if ('explicitWait' in p) {
    if (!isWait(p.explicitWait)) return null
    out.explicitWait = p.explicitWait
  }
  if ('selectorPriority' in p) {
    if (!isPriority(p.selectorPriority)) return null
    out.selectorPriority = p.selectorPriority
  }
  return out
}

const handler = async (input: unknown): Promise<{ success: boolean; error?: string }> => {
  const projectPath = appState.projectPath
  if (!projectPath) return { success: false, error: 'No project open' }
  const patch = validSettingsPatch(input)
  if (patch === null) return { success: false, error: 'The settings are not valid.' }
  try {
    await writeRecorderSettings(projectPath, patch)
    // A project opened meanwhile has settings of its own: this patch was for the other one
    if (appState.projectPath === projectPath) {
      appState.recorderSettings = { ...appState.recorderSettings, ...patch }
    }
    return { success: true }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}

export default handler
