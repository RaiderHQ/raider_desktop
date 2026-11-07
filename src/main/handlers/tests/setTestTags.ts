import { appState } from '../appState'
import { activationSettled } from '../project/setActiveProject'
import { broadcast, filesStore } from './recordedStore'
import { setTagsForFile } from './recordedTests'
import { isSafeRelPath } from './sidecar'
import { MAX_TAGS, normalizeTags } from '../../../shared/tags'
import { safeError } from '../../utils/safeLog'

export { MAX_TAGS }

export type SetTestTagsResult =
  | { success: true; fileOnly?: true }
  | { success: false; error: string }

const NOT_FOUND = 'This test could not be found.'
const NOT_SAVED = 'The tags could not be saved.'
const DESCRIBE_LINE = "This test's describe line could not be changed; edit it in the file."

const fail = (error: string): SetTestTagsResult => ({ success: false, error })

/** 'set-test-tags': tags for the spec at `fileRel`; never throws, and only fixed messages leave. */
export async function setTestTags(fileRel: unknown, tags: unknown): Promise<SetTestTagsResult> {
  try {
    if (!isSafeRelPath(fileRel) || !fileRel.endsWith('_spec.rb')) return fail(NOT_FOUND)
    if (!Array.isArray(tags)) return fail(NOT_SAVED)
    if (tags.length > MAX_TAGS) return fail(`A test can have at most ${MAX_TAGS} tags.`)
    const clean = normalizeTags(tags)

    await activationSettled()
    const { projectPath, layout } = appState
    if (!projectPath || !layout) return fail(NOT_FOUND)

    const saved = await setTagsForFile(projectPath, layout, fileRel, clean)
    if (saved.kind === 'notFound') return fail(NOT_FOUND)
    if (saved.kind === 'describeLine') return fail(DESCRIBE_LINE)

    // Lists reload from the tests; keep the in-memory copies in step
    const store = filesStore()
    if (store && store.projectPath === projectPath) {
      for (const test of store.tests.values()) {
        if (test.file === fileRel) test.tags = clean.length > 0 ? clean : undefined
      }
      broadcast(store)
    } else {
      appState.mainWindow?.webContents.send('tests-updated', Array.from(appState.tests.values()))
    }
    return saved.kind === 'fileOnly' ? { success: true, fileOnly: true } : { success: true }
  } catch (error) {
    safeError('Could not set the test tags:', error)
    return fail((error as NodeJS.ErrnoException)?.code === 'ENOENT' ? NOT_FOUND : NOT_SAVED)
  }
}
