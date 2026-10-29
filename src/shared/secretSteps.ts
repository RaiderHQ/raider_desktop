import type { Step } from './types/step'

export type SecretStep = Extract<Step, { kind: 'type' }> & { secret: true }

export const isSecretStep = (step: Step): step is SecretStep =>
  step.kind === 'type' && step.secret === true

/** The variable a secret step reads when it is shown or rendered outside its test. */
export const SECRET_ENV_FALLBACK = 'RAIDER_SECRET'

/**
 * The environment variable each secret step of a test reads, by step id:
 * RAIDER_SECRET_1, RAIDER_SECRET_2, … in the order the steps appear.
 */
export function secretEnvNames(steps: Step[]): Map<string, string> {
  const names = new Map<string, string>()
  for (const step of steps) {
    if (isSecretStep(step)) names.set(step.id, `RAIDER_SECRET_${names.size + 1}`)
  }
  return names
}

/** The variables the secret steps need that `env` doesn't set, in step order. */
export function missingSecrets(steps: Step[], env: Record<string, string | undefined>): string[] {
  return [...secretEnvNames(steps).values()].filter((name) => env[name] === undefined)
}
