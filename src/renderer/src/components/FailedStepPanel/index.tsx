import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import FailureDetails from '@components/FailureDetails'
import ScreenshotComparison from '@components/ScreenshotComparison'
import { describeStep } from '@shared/describeStep'
import { canRePick, editableValue } from '@shared/stepFixes'
import type { Test } from '@shared/types/test'
import type { FailedStepState } from '../../hooks/useFailedStep'
import StepPicture from './StepPicture'

interface FailedStepPanelProps {
  state: FailedStepState
  test: Test
  projectPath: string
  readOnly: boolean
  /** The fixes offered for this failure */
  actions: React.ReactNode
  /** Picks the failed step's element again on the page */
  onRePick?: () => void
  /** The step (1-based) a replay for Re-pick couldn't get past, before the failed one */
  replayFailedStep?: number | null
  /** Opens the form that corrects the failed step's value */
  onEditValue?: () => void
  /** Re-records the test from the given step (0-based): the failed step, or the first when unknown */
  onReRecord?: (index: number) => void
  /** The failed step was corrected since this result: nothing more to fix until a new run */
  fixed?: boolean
  onRunAgain?: () => void
}

const ACTION =
  'text-xs px-2.5 py-1 rounded border border-neutral-bdr font-medium bg-white hover:bg-neutral-50'

/** The recording's picture of one step; undefined while the trace loads. */
const useRecordedPicture = (testId: string, stepId: string | null): string | null | undefined => {
  const [path, setPath] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    let active = true
    setPath(undefined)
    if (!stepId) return
    window.api
      .loadTrace(testId)
      .then((res) => {
        const entry = res.trace?.find((e) => e.stepId === stepId && e.screenshotPath)
        if (active) setPath(entry?.screenshotPath ?? null)
      })
      .catch(() => {
        if (active) setPath(null)
      })
    return (): void => {
      active = false
    }
  }, [testId, stepId])
  return path
}

/** Where and why the last run of a recorded test failed, with what can be done about it. */
const FailedStepPanel: React.FC<FailedStepPanelProps> = ({
  state,
  test,
  projectPath,
  readOnly,
  actions,
  onRePick,
  replayFailedStep = null,
  onEditValue,
  onReRecord,
  fixed = false,
  onRunAgain
}) => {
  const { t } = useTranslation()
  const mapped = state.status === 'mapped' ? state : null
  const recordedPicture = useRecordedPicture(test.id, mapped?.step.id ?? null)
  if (state.status === 'none') return null

  const { result } = state
  const canEditValue = !!mapped && !!onEditValue && editableValue(mapped.step) !== null
  const offerRePick = !!mapped && !!onRePick && canRePick(test.steps, mapped.index)
  const replayFailed = mapped && replayFailedStep !== null ? replayFailedStep : null
  const failurePicture = (
    <StepPicture
      testId="picture-failed"
      label={t('failedStep.whenFailed')}
      path={result.screenshot ?? null}
      missing={t('failedStep.noRunPicture')}
    />
  )

  let heading: React.ReactNode
  if (fixed && !readOnly) {
    heading = <h2 className="text-sm font-semibold text-status-ok">{t('failedStep.fixed')}</h2>
  } else if (mapped) {
    const desc = describeStep(mapped.step)
    heading = (
      <>
        <h2 className="text-sm font-semibold text-red-700">
          {t('failedStep.title', { n: mapped.index + 1, step: t(desc.key, desc.values) })}
        </h2>
        <p className="text-sm text-neutral-dark">{t(mapped.reason.key, mapped.reason.params)}</p>
        {replayFailed !== null && (
          <p className="text-sm text-neutral-dark">
            {t('failedStep.replayFailed', { n: mapped.index + 1, m: replayFailed })}
          </p>
        )}
      </>
    )
  } else {
    heading = (
      <h2 className="text-sm font-semibold text-red-700">
        {t(state.status === 'unmapped' ? 'failedStep.unmapped' : 'failedStep.changedSinceRun')}
      </h2>
    )
  }

  return (
    <section
      data-testid="failed-step-panel"
      className={`rounded-lg border p-3 space-y-3 ${
        fixed && !readOnly ? 'border-neutral-bdr bg-neutral-50' : 'border-red-200 bg-red-50/40'
      }`}
    >
      <div className="space-y-0.5">{heading}</div>
      <div className="flex gap-4 items-start">
        {mapped && (
          <StepPicture
            testId="picture-recorded"
            label={t('failedStep.whenRecorded')}
            path={recordedPicture}
            missing={t('failedStep.noRecordingPicture')}
          />
        )}
        {failurePicture}
        {/* A lone picture keeps the size it has beside another */}
        {!mapped && <div className="flex-1" />}
      </div>
      {!readOnly && fixed && onRunAgain && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={ACTION} onClick={onRunAgain}>
            {t('failedStep.runAgain')}
          </button>
        </div>
      )}
      {!readOnly && !fixed && (actions || offerRePick || canEditValue || onReRecord) && (
        <div className="flex flex-wrap gap-2">
          {offerRePick && (
            <button type="button" className={ACTION} onClick={onRePick}>
              {t('failedStep.rePick')}
            </button>
          )}
          {canEditValue && (
            <button type="button" className={ACTION} onClick={onEditValue}>
              {t('failedStep.editValue')}
            </button>
          )}
          {onReRecord && (
            <button type="button" className={ACTION} onClick={() => onReRecord(mapped?.index ?? 0)}>
              {t('failedStep.reRecord')}
            </button>
          )}
          {replayFailed !== null && onReRecord && (
            <button type="button" className={ACTION} onClick={() => onReRecord(replayFailed - 1)}>
              {t('failedStep.reRecordFrom', { m: replayFailed })}
            </button>
          )}
          {actions}
        </div>
      )}
      {result.failure && (
        <FailureDetails collapsed failure={result.failure} projectPath={projectPath} />
      )}
      {!!result.comparisons?.length && (
        <ScreenshotComparison comparisons={result.comparisons} runId={result.finishedAt} />
      )}
    </section>
  )
}

export default FailedStepPanel
