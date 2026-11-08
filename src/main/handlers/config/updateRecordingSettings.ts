import { appState } from '../appState'
import { writeRecorderSettings } from './projectSettings'
import { migrateRecordedTests } from '../tests/migrateRecordedTests'
import { loadRecordedTests } from '../tests/loadTests'
import { safeError } from '../../utils/safeLog'
import { TEST_ID_ATTRIBUTE_NAME } from '../../../shared/testIdAttribute'
import type { RecorderSettings } from '@shared/types/recorderSettings'

type SettingsPatch = Partial<
  Pick<RecorderSettings, 'implicitWait' | 'explicitWait' | 'selectorPriority' | 'testIdAttribute'>
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
  // Written to config.yml and read by the runtime's Selectors.attribute_css: a plain name only
  if ('testIdAttribute' in p) {
    if (typeof p.testIdAttribute !== 'string' || !TEST_ID_ATTRIBUTE_NAME.test(p.testIdAttribute))
      return null
    out.testIdAttribute = p.testIdAttribute
  }
  return out
}

/**
 * A recorded spec writes `test_id:` only for its project's attribute, and the runtime reads
 * test_id: through the current one. After a change, the specs Raider owns are written again so
 * a test id recorded under the old attribute keeps finding its element (as a CSS locator).
 * Files edited by hand are left alone, as on every save.
 */
async function regenerateNow(projectPath: string): Promise<void> {
  try {
    const layout = appState.layout
    if (!layout || appState.projectPath !== projectPath) return
    await migrateRecordedTests(projectPath, layout, { force: true })
    const tests = await loadRecordedTests(projectPath)
    if (appState.projectPath !== projectPath) return
    appState.tests = new Map(tests.map((test) => [test.id, test]))
    appState.mainWindow?.webContents.send('tests-updated', tests)
  } catch (error) {
    safeError('Could not rewrite the recorded tests for the new test id attribute:', error)
  }
}

// One regeneration at a time per project; a change during one runs once more afterwards,
// with the layout as it is then, so the specs always end on the last attribute
const regenerating = new Map<string, { running: Promise<void>; again: boolean }>()

function regenerateRecordedTests(projectPath: string): Promise<void> {
  const current = regenerating.get(projectPath)
  if (current) {
    current.again = true
    return current.running
  }
  const entry = { running: Promise.resolve(), again: false }
  entry.running = (async (): Promise<void> => {
    try {
      do {
        entry.again = false
        await regenerateNow(projectPath)
      } while (entry.again)
    } finally {
      regenerating.delete(projectPath)
    }
  })()
  regenerating.set(projectPath, entry)
  return entry.running
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
      // Recording and code generation read the attribute from the layout too
      if (patch.testIdAttribute !== undefined && appState.layout) {
        const changed = appState.layout.testIdAttribute !== patch.testIdAttribute
        appState.layout = { ...appState.layout, testIdAttribute: patch.testIdAttribute }
        if (changed) await regenerateRecordedTests(projectPath)
      }
    }
    return { success: true }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}

export default handler
