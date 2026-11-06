import React from 'react'
import toast from 'react-hot-toast'
import i18n from 'i18next'
import type { Test } from '@foundation/Types/test'
import type { Step } from '@shared/types/step'

type UpdateTest = (updater: (prev: Test | null) => Test | null) => void

const UNDO_WINDOW_MS = 6000

const StepRemovedToast: React.FC<{ onUndo: () => void }> = ({ onUndo }) => (
  <span className="flex items-center gap-3 text-sm text-neutral-dark">
    {i18n.t('steps.removed')}
    <button
      type="button"
      onClick={onUndo}
      className="font-semibold text-ruby underline underline-offset-2"
    >
      {i18n.t('steps.undo')}
    </button>
  </span>
)

/**
 * Removes a step from the active test at once and offers Undo for a few seconds,
 * since the × on a step has no confirmation. Undo puts the step back at its index.
 */
export function removeStepWithUndo(updateActiveTest: UpdateTest, index: number): void {
  let removed: Step | undefined
  updateActiveTest((prev) => {
    if (!prev || index < 0 || index >= prev.steps.length) return prev
    removed = prev.steps[index]
    return { ...prev, steps: prev.steps.filter((_, i) => i !== index) }
  })
  if (!removed) return
  const step = removed
  const undo = (id: string): void => {
    updateActiveTest((prev) =>
      prev
        ? { ...prev, steps: [...prev.steps.slice(0, index), step, ...prev.steps.slice(index)] }
        : prev
    )
    toast.dismiss(id)
  }
  toast((instance) => <StepRemovedToast onUndo={() => undo(instance.id)} />, {
    duration: UNDO_WINDOW_MS,
    id: `step-removed-${step.id}`
  })
}
