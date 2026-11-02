import { app } from 'electron'
import { join, basename, resolve, sep } from 'path'
import { mkdir, copyFile, writeFile, readFile, readdir, realpath, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import { appState } from '../appState'
import { persistActiveSuites } from '../suitePersistence'
import type { TraceStep } from '@foundation/Types/traceStep'

type ExistingTrace = { entries: TraceStep[]; readable: boolean }

/** The trace on disk; a missing file is empty, a file that can't be read or parsed is not readable */
async function readExisting(jsonPath: string): Promise<ExistingTrace> {
  let raw: string
  try {
    raw = await readFile(jsonPath, 'utf-8')
  } catch (error) {
    return { entries: [], readable: (error as NodeJS.ErrnoException).code === 'ENOENT' }
  }
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed)
      ? { entries: parsed, readable: true }
      : { entries: [], readable: false }
  } catch {
    return { entries: [], readable: false }
  }
}

/** Removes the regular files of the test's own folder that no entry points at; never follows links */
async function removeUnreferencedPictures(
  tracesDir: string,
  testTraceDir: string,
  kept: Set<string>
): Promise<void> {
  const root = await realpath(tracesDir)
  const dir = await realpath(testTraceDir)
  if (!dir.startsWith(root + sep)) return
  for (const dirent of await readdir(dir, { withFileTypes: true })) {
    if (!dirent.isFile() || kept.has(dirent.name)) continue
    await unlink(join(dir, dirent.name))
  }
}

export default async (
  testId: string,
  trace: TraceStep[],
  stepIds?: string[]
): Promise<{ success: boolean; error?: string }> => {
  try {
    const tracesDir = join(app.getPath('userData'), 'traces')
    const testTraceDir = join(tracesDir, testId)

    await mkdir(testTraceDir, { recursive: true })

    const jsonPath = join(tracesDir, `${testId}.trace.json`)
    const updatedTrace: TraceStep[] = []
    let existing: ExistingTrace = { entries: [], readable: false }

    // Record from here: the earlier entries of the steps that remain keep their pictures
    if (stepIds) {
      existing = await readExisting(jsonPath)
      const incoming = new Set(trace.map((step) => step.id))
      const remaining = new Set(stepIds)
      for (const entry of existing.entries) {
        if (!entry.stepId || !remaining.has(entry.stepId) || incoming.has(entry.id)) continue
        const kept = { ...entry }
        if (kept.screenshotPath && !existsSync(kept.screenshotPath)) delete kept.screenshotPath
        updatedTrace.push(kept)
      }
    }

    for (const step of trace) {
      const updatedStep = { ...step }

      if (step.screenshotPath && existsSync(step.screenshotPath)) {
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
    if (stepIds && existing.readable) {
      const wanted = new Set(
        updatedTrace.flatMap((step) => (step.screenshotPath ? [basename(step.screenshotPath)] : []))
      )
      await removeUnreferencedPictures(tracesDir, testTraceDir, wanted)
    }

    // Update in-memory suite: find the test and set hasTrace = true
    for (const suite of appState.suites.values()) {
      const test = suite.tests.find((t) => t.id === testId)
      if (test) {
        test.hasTrace = true
        break
      }
    }

    await persistActiveSuites()

    // Broadcast updated suites
    appState.mainWindow?.webContents.send('suite-updated', Array.from(appState.suites.values()))

    return { success: true }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}
