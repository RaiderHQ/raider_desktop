import { useCallback, useEffect, useRef, useState } from 'react'
import type { TFunction } from 'i18next'
import { useRunStore } from '@foundation/Stores/runStore'
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
  const [state, setState] = useState<FailedStepState>(NONE)
  const shownFor = useRef<string | null>(null)
  const testId = test?.id ?? null

  useEffect(() => {
    // Another test forgets the last one's answer; the same test keeps it while re-asking
    if (shownFor.current !== testId) setState(NONE)
    shownFor.current = testId
    if (!projectPath || !test || !result) {
      setState(NONE)
      return
    }
    let active = true
    resolveFailedStep(projectPath, test, result)
      .then((next) => {
        if (active) setState(next)
      })
      .catch(() => {
        if (active) setState(NONE)
      })
    return (): void => {
      active = false
    }
  }, [projectPath, testId, test?.ownership, test?.steps, test?.file, result])

  return state
}

/** The failed step of a test's newest run, reloaded after each run of this project. */
export function useFailedStep(
  projectPath: string | null,
  test: Test | null
): FailedStepState & { reload(): void } {
  // The Dashboard's selector: a finished run of this project rewrites raider-results
  const lastRunFinishedAt = useRunStore((s) =>
    s.run && s.run.projectPath === projectPath ? (s.run.finished?.finishedAt ?? null) : null
  )
  const [result, setResult] = useState<TestResult | null>(null)
  const [reloads, setReloads] = useState(0)
  const file = test?.file
  const loadedFor = useRef<string | null>(null)

  useEffect(() => {
    // A reload keeps the shown result until the new one arrives; another test drops it
    const key = projectPath && file ? `${projectPath}\n${file}` : null
    if (loadedFor.current !== key) setResult(null)
    loadedFor.current = key
    if (!projectPath || !file) return
    let active = true
    loadRaiderResults(projectPath, window.api)
      .then((rows) => {
        const row = rows?.find((r) => FAILED.has(r.status) && r.file === file)
        if (active) setResult(row ?? null)
      })
      .catch(() => {})
    return (): void => {
      active = false
    }
  }, [projectPath, file, lastRunFinishedAt, reloads])

  const state = useFailedStepFor(projectPath, test, result)
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
