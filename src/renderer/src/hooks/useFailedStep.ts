import { useCallback, useEffect, useState } from 'react'
import type { TFunction } from 'i18next'
import { useRunStore } from '@foundation/Stores/runStore'
import useRecorderStore from '@foundation/Stores/recorderStore'
import type { RunView } from '@foundation/run/runModel'
import { loadRaiderResults } from '@foundation/raiderResults'
import type { TestResult } from '@foundation/Types/testResult'
import { describeStep, elementName } from '@shared/describeStep'
import { failureReason, type FailureReason } from '@shared/failureReason'
import type { Step } from '@shared/types/step'
import type { Test } from '@shared/types/test'

export type FailedStepState =
  | { status: 'none' }
  | { status: 'mapped'; index: number; step: Step; reason: FailureReason; result: TestResult }
  | { status: 'unmapped'; result: TestResult } // outsideSteps, noMap
  | { status: 'changedSinceRun'; result: TestResult }

const NONE: FailedStepState = { status: 'none' }
const FAILED = new Set(['failed', 'broken'])

/** Which recorded step a failed result points at, asked of main. */
export async function resolveFailedStep(
  projectPath: string,
  test: Test,
  result: TestResult
): Promise<FailedStepState> {
  const { failure } = result
  if (!FAILED.has(result.status) || !failure || test.ownership !== 'recorded') return NONE
  const map = await window.api.mapFailedStep(projectPath, test.id, {
    file: result.file ?? test.file ?? '',
    backtrace: failure.backtrace,
    appFrame: failure.appFrame,
    finishedAt: result.finishedAt
  })
  if ('none' in map) {
    if (map.none === 'changedSinceRun') return { status: 'changedSinceRun', result }
    if (map.none === 'outsideSteps' || map.none === 'noMap') return { status: 'unmapped', result }
    return NONE
  }
  const index = test.steps.findIndex((s) => s.id === map.stepId)
  // The steps moved on since main read the file: the run no longer matches them
  if (index === -1) return { status: 'changedSinceRun', result }
  const step = test.steps[index]
  const element = 'element' in step ? elementName(step.element) : ''
  return { status: 'mapped', index, step, reason: failureReason(failure, step, element), result }
}

/** The failed step for one known result; none until main has answered. */
export function useFailedStepFor(
  projectPath: string | null,
  test: Test | null,
  result: TestResult | null
): FailedStepState {
  const testId = test?.id ?? null
  const key = projectPath && testId ? `${projectPath}\n${testId}` : null
  // Kept with the test it was for: another test or project never paints this answer,
  // the same one keeps it while re-asking
  const [shown, setShown] = useState<{ key: string | null; state: FailedStepState }>({
    key: null,
    state: NONE
  })

  useEffect(() => {
    if (!projectPath || !test || !result) {
      setShown({ key, state: NONE })
      return
    }
    let active = true
    resolveFailedStep(projectPath, test, result)
      .then((state) => {
        if (active) setShown({ key, state })
      })
      .catch(() => {
        if (active) setShown({ key, state: NONE })
      })
    return (): void => {
      active = false
    }
  }, [key, test?.ownership, test?.steps, test?.file, result])

  return shown.key === key ? shown.state : NONE
}

const stripDot = (file: string): string => file.replace(/^\.\//, '')

/** Whether a run may have rewritten this file's results: unknown counts as yes. */
const runTouches = (run: RunView, file: string): boolean => {
  const { scope } = run
  if (scope.kind === 'all') return true
  if (run.order.some((id) => stripDot(run.tests[id].file) === file)) return true
  if (scope.kind === 'files') return scope.files.some((f) => stripDot(f) === file)
  if (scope.kind === 'locations')
    return scope.locations.some((l) => stripDot(l.replace(/(:\d+)+$/, '')) === file)
  // A tag run that reported no examples could have run any file
  return run.order.length === 0
}

/**
 * The failed step of a test's newest run. Reloaded after each finished run that may
 * have included the test's file; nothing while it's being recorded.
 */
export function useFailedStep(
  projectPath: string | null,
  test: Test | null
): FailedStepState & { reload(): void } {
  const file = test?.file
  // Picking an element records nothing: the result stays, so the fix it makes can show as fixed
  const recording = useRecorderStore(
    (s) => s.recordingTarget !== null && s.recordingTarget.kind !== 'pick'
  )
  const touchedAt = useRunStore((s) => {
    const run = s.run
    if (!run?.finished || run.projectPath !== projectPath || !file) return null
    return runTouches(run, file) ? run.finished.finishedAt : null
  })
  // The last run that touched the file: an unrelated run since leaves it as it is
  const [lastTouch, setLastTouch] = useState(touchedAt)
  useEffect(() => {
    if (touchedAt) setLastTouch(touchedAt)
  }, [touchedAt])

  const key = projectPath && test && file ? `${projectPath}\n${test.id}\n${file}` : null
  const [loaded, setLoaded] = useState<{ key: string | null; result: TestResult | null }>({
    key: null,
    result: null
  })
  const [reloads, setReloads] = useState(0)

  useEffect(() => {
    // A recording changes the steps: its result is looked up again once it stops
    if (recording) setLoaded({ key: null, result: null })
    if (!projectPath || !file || recording) return
    let active = true
    loadRaiderResults(projectPath, window.api)
      .then((rows) => {
        const row = rows?.find((r) => FAILED.has(r.status) && r.file === file)
        if (active) setLoaded({ key, result: row ?? null })
      })
      .catch((error: unknown) => console.error('Loading the last run failed:', error))
    return (): void => {
      active = false
    }
  }, [key, recording, lastTouch, reloads])

  // A reload keeps the shown result until the new one arrives; another test or project drops it
  const result = loaded.key === key ? loaded.result : null
  const state = useFailedStepFor(projectPath, recording ? null : test, result)
  const reload = useCallback(() => setReloads((n) => n + 1), [])
  return { ...state, reload }
}

/** One line for where and why a test failed, or null when there's nothing to say. */
export function failedStepLine(t: TFunction, state: FailedStepState): string | null {
  switch (state.status) {
    case 'mapped': {
      const desc = describeStep(state.step)
      const title = t('failedStep.title', { n: state.index + 1, step: t(desc.key, desc.values) })
      return `${title}. ${t(state.reason.key, state.reason.params)}`
    }
    case 'unmapped':
      return t('failedStep.unmapped')
    case 'changedSinceRun':
      return t('failedStep.changedSinceRun')
    default:
      return null
  }
}
