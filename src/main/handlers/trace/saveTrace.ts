import { app } from 'electron'
import { join } from 'path'
import { mkdir, copyFile, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { appState } from '../appState'
import type { TraceStep } from '@foundation/Types/traceStep'

export default async (
  testId: string,
  trace: TraceStep[]
): Promise<{ success: boolean; error?: string }> => {
  try {
    const tracesDir = join(app.getPath('userData'), 'traces')
    const testTraceDir = join(tracesDir, testId)

    await mkdir(testTraceDir, { recursive: true })

    const updatedTrace: TraceStep[] = []

    for (const step of trace) {
      const updatedStep = { ...step }

      if (step.screenshotPath && existsSync(step.screenshotPath)) {
        const filename = `${step.id}.jpg`
        const destPath = join(testTraceDir, filename)
        await copyFile(step.screenshotPath, destPath)
        updatedStep.screenshotPath = destPath
      }

      updatedTrace.push(updatedStep)
    }

    const jsonPath = join(tracesDir, `${testId}.trace.json`)
    await writeFile(jsonPath, JSON.stringify(updatedTrace, null, 2), 'utf-8')

    // Update in-memory suite: find the test and set hasTrace = true
    for (const suite of appState.suites.values()) {
      const test = suite.tests.find((t) => t.id === testId)
      if (test) {
        test.hasTrace = true
        break
      }
    }

    // Broadcast updated suites
    appState.mainWindow?.webContents.send(
      'suite-updated',
      Array.from(appState.suites.values())
    )

    return { success: true }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}
