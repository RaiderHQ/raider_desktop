import type { Step } from './types/step'

const VALUE_CHECKS = ['textEquals', 'textIncludes', 'valueEquals', 'titleEquals', 'urlIncludes']

/** The one value of a step a user may correct: typed text, an expected value or a URL. */
export function editableValue(step: Step): string | null {
  if (step.kind === 'type') return step.secret ? null : step.text
  if (step.kind === 'assert')
    return VALUE_CHECKS.includes(step.check) ? (step.expected ?? '') : null
  if (step.kind === 'navigate') return step.url
  return null
}

/** The step with its editable value replaced; any other step comes back as it was. */
export function withValue(step: Step, value: string): Step {
  if (editableValue(step) === null) return step
  if (step.kind === 'type') return { ...step, text: value }
  if (step.kind === 'assert') return { ...step, expected: value }
  if (step.kind === 'navigate') return { ...step, url: value }
  return step
}

/** Whether the step runs inside a frame: the last frame switch before it picked one. */
export function isInsideFrame(steps: Step[], index: number): boolean {
  for (let i = index - 1; i >= 0; i--) {
    const step = steps[i]
    if (step.kind === 'switchFrame') return step.element !== undefined
  }
  return false
}

/** Whether the step's element can be picked again on the page. */
export function canRePick(steps: Step[], index: number): boolean {
  const step = steps[index]
  return !!step && 'element' in step && !!step.element && !isInsideFrame(steps, index)
}
