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
 * since the × on a step has no confirmation. Undo puts the step back in front of
 * the step that followed it (or at its old index when that one is gone too), and
 * only into the test it came from.
 */
export function removeStepWithUndo(updateActiveTest: UpdateTest, index: number): void {
  let removed: { testId: string; step: Step; nextId: string | undefined } | undefined
  updateActiveTest((prev) => {
    if (!prev || index < 0 || index >= prev.steps.length) return prev
    removed = { testId: prev.id, step: prev.steps[index], nextId: prev.steps[index + 1]?.id }
    return { ...prev, steps: prev.steps.filter((_, i) => i !== index) }
  })
  if (!removed) return
  const { testId, step, nextId } = removed
  let done = false
  const undo = (toastId: string): void => {
    if (done) return
    done = true
    updateActiveTest((prev) => {
      if (!prev || prev.id !== testId || prev.steps.some((s) => s.id === step.id)) return prev
      const after = nextId ? prev.steps.findIndex((s) => s.id === nextId) : -1
      const at = after >= 0 ? after : Math.min(index, prev.steps.length)
      return { ...prev, steps: [...prev.steps.slice(0, at), step, ...prev.steps.slice(at)] }
    })
    toast.dismiss(toastId)
  }
  toast((instance) => <StepRemovedToast onUndo={() => undo(instance.id)} />, {
    duration: UNDO_WINDOW_MS,
    id: `step-removed-${step.id}`
  })
}
