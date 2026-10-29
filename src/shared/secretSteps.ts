import { SECRET_NAME, type Step } from './types/step'

export type SecretStep = Extract<Step, { kind: 'type' }> & { secret: true }

export const isSecretStep = (step: Step): step is SecretStep =>
  step.kind === 'type' && step.secret === true

/** The variable a secret step reads before it has a name (e.g. a trace command). */
export const SECRET_ENV_FALLBACK = 'RAIDER_SECRET'

export const isValidSecretName = (name: string): boolean => SECRET_NAME.test(name)

// Custom code (e.g. a hand-edited secret step) can read a variable too
const NUMBERED = /RAIDER_SECRET_(\d+)/g

function usedNumbers(steps: Step[]): Set<number> {
  const used = new Set<number>()
  for (const step of steps) {
    const text = isSecretStep(step)
      ? (step.secretName ?? '')
      : step.kind === 'custom'
        ? step.code
        : ''
    for (const match of text.matchAll(NUMBERED)) used.add(Number(match[1]))
  }
  return used
}

/** The lowest RAIDER_SECRET_<n> that no step of the test uses yet. */
export function nextSecretName(steps: Step[]): string {
  const used = usedNumbers(steps)
  let n = 1
  while (used.has(n)) n++
  return `RAIDER_SECRET_${n}`
}

/**
 * Names a secret step that has no name yet, from the steps already in its test. The
 * name is stored on the step, so moving, adding or deleting steps never renumbers it.
 */
export function nameSecretStep(step: Step, steps: Step[]): Step {
  if (!isSecretStep(step) || step.secretName) return step
  return { ...step, secretName: nextSecretName(steps) }
}

/** Names the unnamed secret steps of a test (recorded before names were stored), in order. */
export function withSecretNames(steps: Step[]): Step[] {
  if (!steps.some((step) => isSecretStep(step) && !step.secretName)) return steps
  const named: Step[] = []
  for (const step of steps) {
    // Names already taken anywhere in the test stay taken
    named.push(nameSecretStep(step, [...named, ...steps]))
  }
  return named
}

/** The variable a secret step reads. */
export const secretNameOf = (step: Step): string =>
  (step.kind === 'type' && step.secretName) || SECRET_ENV_FALLBACK

/** The variables the secret steps need that `env` doesn't set, once each, in step order. */
export function missingSecrets(steps: Step[], env: Record<string, string | undefined>): string[] {
  const names = withSecretNames(steps)
    .filter(isSecretStep)
    .map((step) => secretNameOf(step))
  return [...new Set(names)].filter((name) => env[name] === undefined)
}
