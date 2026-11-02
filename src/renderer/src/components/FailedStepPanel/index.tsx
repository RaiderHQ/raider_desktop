import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import FailureDetails from '@components/FailureDetails'
import { describeStep } from '@shared/describeStep'
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
}

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
  actions
}) => {
  const { t } = useTranslation()
  const mapped = state.status === 'mapped' ? state : null
  const recordedPicture = useRecordedPicture(test.id, mapped?.step.id ?? null)
  if (state.status === 'none') return null

  const { result } = state
  const failurePicture = (
    <StepPicture
      testId="picture-failed"
      label={t('failedStep.whenFailed')}
      path={result.screenshot ?? null}
      missing={t('failedStep.noRunPicture')}
    />
  )

  let heading: React.ReactNode
  if (mapped) {
    const desc = describeStep(mapped.step)
    heading = (
      <>
        <h2 className="text-sm font-semibold text-red-700">
          {t('failedStep.title', { n: mapped.index + 1, step: t(desc.key, desc.values) })}
        </h2>
        <p className="text-sm text-neutral-dark">{t(mapped.reason.key, mapped.reason.params)}</p>
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
      className="rounded-lg border border-red-200 bg-red-50/40 p-3 space-y-3"
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
      {!readOnly && actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      {result.failure && (
        <FailureDetails collapsed failure={result.failure} projectPath={projectPath} />
      )}
    </section>
  )
}

export default FailedStepPanel
