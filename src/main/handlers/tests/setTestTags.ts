import fs from 'fs/promises'
import { appState } from '../appState'
import { activationSettled } from '../project/setActiveProject'
import { broadcast, filesStore } from './suiteStore'
import { setRecordedTags } from './recordedTests'
import {
  assertRealInside,
  isSafeRelPath,
  readSidecar,
  resolveInside,
  writeFileAtomic
} from './sidecar'
import { describeLineWithTags, normalizeTags } from '../../../shared/tags'
import { safeError } from '../../utils/safeLog'

export const MAX_TAGS = 20
const DESCRIBE_LINE = /^[ \t]*(?:RSpec\.)?describe\b.*$/m

export type SetTestTagsResult =
  | { success: true; fileOnly?: true }
  | { success: false; error: string }

const fail = (error: string): SetTestTagsResult => ({ success: false, error })

/** Rewrites only the first describe line of a spec nobody recorded. */
async function rewriteDescribeLine(
  projectPath: string,
  fileRel: string,
  tags: string[]
): Promise<SetTestTagsResult> {
  const target = resolveInside(projectPath, fileRel)
  await assertRealInside(projectPath, target)
  const stat = await fs.lstat(target)
  if (!stat.isFile()) return fail('This test could not be found.')
  const content = await fs.readFile(target, 'utf-8')
  const match = DESCRIBE_LINE.exec(content)
  const rewritten = match ? describeLineWithTags(match[0], tags) : null
  if (!match || rewritten === null) return fail('This test has no describe line to tag.')
  if (rewritten !== match[0]) {
    const updated =
      content.slice(0, match.index) + rewritten + content.slice(match.index + match[0].length)
    await writeFileAtomic(target, updated)
  }
  return { success: true, fileOnly: true }
}

/** 'set-test-tags': tags for the spec at `fileRel`; never throws. */
export async function setTestTags(fileRel: unknown, tags: unknown): Promise<SetTestTagsResult> {
  try {
    if (!isSafeRelPath(fileRel) || !fileRel.endsWith('_spec.rb')) {
      return fail('This is not a test file.')
    }
    if (!Array.isArray(tags)) return fail('The tags are not valid.')
    const clean = normalizeTags(tags)
    if (clean.length > MAX_TAGS) return fail(`A test can have at most ${MAX_TAGS} tags.`)

    await activationSettled()
    const { projectPath, layout } = appState
    if (!projectPath || !layout) return fail('No project is open.')
    if (layout.framework !== 'rspec') return fail('Tags need an RSpec project.')
    const target = resolveInside(projectPath, fileRel)
    await assertRealInside(projectPath, target)

    const sidecar = await readSidecar(projectPath, fileRel)
    let result: SetTestTagsResult
    if (sidecar) {
      const saved = await setRecordedTags(projectPath, layout, fileRel, clean)
      if (!saved) return fail('This test could not be found.')
      result = { success: true }
    } else {
      result = await rewriteDescribeLine(projectPath, fileRel, clean)
    }
    if (result.success) {
      // Lists reload from the suites; keep the in-memory copies in step
      const store = filesStore()
      if (store && store.projectPath === projectPath) {
        for (const suite of store.suites.values()) {
          for (const test of suite.tests) {
            if (test.file === fileRel) test.tags = clean.length > 0 ? clean : undefined
          }
        }
        broadcast(store)
      } else {
        appState.mainWindow?.webContents.send('suite-updated', Array.from(appState.suites.values()))
      }
    }
    return result
  } catch (error) {
    safeError('Could not set the test tags:', error)
    return fail(error instanceof Error ? error.message : 'The tags could not be saved.')
  }
}
