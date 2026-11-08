import { app } from 'electron'
import { join, basename, resolve, relative, isAbsolute } from 'path'
import { tmpdir } from 'os'
import { mkdir, copyFile, writeFile, readFile, readdir, realpath, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import { appState } from '../appState'
import { serialize } from '../tests/sidecar'
import { safeError } from '../../utils/safeLog'
import { isSafeTraceId } from './traceId'
import type { TraceStep } from '@foundation/Types/traceStep'

// Per test id: overlapping saves would otherwise clean up each other's fresh pictures
const saveQueues = new Map<string, Promise<unknown>>()

// `existed`: the old file was there and held a list, so it says which pictures are wanted
type ExistingTrace = { entries: TraceStep[]; existed: boolean }

/** The trace on disk; a missing, unreadable or unparsable file gives no entries and `existed: false` */
async function readExisting(jsonPath: string): Promise<ExistingTrace> {
  let raw: string
  try {
    raw = await readFile(jsonPath, 'utf-8')
  } catch {
    return { entries: [], existed: false }
  }
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed)
      ? { entries: parsed, existed: true }
      : { entries: [], existed: false }
  } catch {
    return { entries: [], existed: false }
  }
}

/** Removes the regular files of the test's own folder that no entry points at; never follows links */
async function removeUnreferencedPictures(
  tracesDir: string,
  testTraceDir: string,
  testId: string,
  kept: Set<string>
): Promise<void> {
  const root = await realpath(tracesDir)
  const dir = await realpath(testTraceDir)
  // A test folder that is itself a link (or elsewhere) is never cleaned
  if (dir !== join(root, testId)) return
  for (const dirent of await readdir(dir, { withFileTypes: true })) {
    if (!dirent.isFile() || kept.has(dirent.name)) continue
    await unlink(join(dir, dirent.name))
  }
}

const isStepIds = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((id) => typeof id === 'string')

export default (
  testId: string,
  trace: TraceStep[],
  stepIds?: unknown
): Promise<{ success: boolean; error?: string }> =>
  // Anything but a list of step ids is saved as without one: it never decides what is deleted
  serialize(saveQueues, testId, () => save(testId, trace, isStepIds(stepIds) ? stepIds : undefined))

const inside = (root: string, target: string): boolean => {
  const rel = relative(root, target)
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

/** The picture is a file under the recorder's temp folder or this test's trace folder. */
async function isRecordedPicture(path: unknown, testTraceDir: string): Promise<boolean> {
  if (typeof path !== 'string' || path === '') return false
  let real: string
  try {
    real = await realpath(path)
  } catch {
    // Not there: nothing to copy, and a path nobody wrote is not kept either
    return false
  }
  const roots = [join(tmpdir(), 'raider-traces'), testTraceDir]
  for (const root of roots) {
    const realRoot = await realpath(root).catch(() => resolve(root))
    if (inside(realRoot, real)) return true
  }
  return false
}

async function save(
  testId: string,
  trace: TraceStep[],
  stepIds?: string[]
): Promise<{ success: boolean; error?: string }> {
  if (!isSafeTraceId(testId)) return { success: false, error: 'Invalid test id' }
  try {
    const tracesDir = join(app.getPath('userData'), 'traces')
    const testTraceDir = join(tracesDir, testId)

    await mkdir(testTraceDir, { recursive: true })

    const jsonPath = join(tracesDir, `${testId}.trace.json`)
    const updatedTrace: TraceStep[] = []
    let existing: ExistingTrace = { entries: [], existed: false }

    // Record from here: the earlier entries of the steps that remain keep their pictures
    if (stepIds) {
      existing = await readExisting(jsonPath)
      const incoming = new Set(trace.map((step) => step.id))
      const remaining = new Set(stepIds)
      for (const entry of existing.entries) {
        // Older entries without a step can't be matched: they stay, with their pictures
        if ((entry.stepId && !remaining.has(entry.stepId)) || incoming.has(entry.id)) continue
        const kept = { ...entry }
        if (kept.screenshotPath && !existsSync(kept.screenshotPath)) delete kept.screenshotPath
        updatedTrace.push(kept)
      }
    }

    for (const step of trace) {
      const updatedStep = { ...step }

      // A picture is copied only from where the recorder writes them (or this test's own
      // folder), and only under a safe step id: both come from the renderer
      if (
        step.screenshotPath &&
        !(isSafeTraceId(step.id) && (await isRecordedPicture(step.screenshotPath, testTraceDir)))
      ) {
        delete updatedStep.screenshotPath
      } else if (step.screenshotPath && existsSync(step.screenshotPath)) {
        const filename = `${step.id}.jpg`
        const destPath = join(testTraceDir, filename)
        if (resolve(step.screenshotPath) !== resolve(destPath)) {
          await copyFile(step.screenshotPath, destPath)
        }
        updatedStep.screenshotPath = destPath
      }

      updatedTrace.push(updatedStep)
    }

    await writeFile(jsonPath, JSON.stringify(updatedTrace, null, 2), 'utf-8')

    // Only when the old trace was read: otherwise nothing says which pictures are still wanted
    if (stepIds && existing.existed) {
      const wanted = new Set(
        updatedTrace.flatMap((step) => (step.screenshotPath ? [basename(step.screenshotPath)] : []))
      )
      try {
        await removeUnreferencedPictures(tracesDir, testTraceDir, testId, wanted)
      } catch (error) {
        safeError(`Could not clean up the pictures of ${testId}:`, error)
      }
    }

    // The tests the renderer holds say whether a trace is saved
    const known = appState.tests.get(testId)
    if (known) known.hasTrace = true
    appState.mainWindow?.webContents.send('tests-updated', Array.from(appState.tests.values()))

    return { success: true }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}
