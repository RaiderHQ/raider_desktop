import en from '../renderer/src/assets/translations/en.json'
import { describeStep } from './describeStep'
import type { Step } from './types/step'

/** Walks a dotted i18n key through the English catalog. */
function lookup(key: string): string | undefined {
  let node: unknown = en
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined
    node = (node as Record<string, unknown>)[part]
  }
  return typeof node === 'string' ? node : undefined
}

/**
 * English text for an i18n key, for main-process messages (main can't use react-i18next).
 * Interpolates `{{name}}` placeholders from `values`.
 */
export function englishText(key: string, values: Record<string, string> = {}): string {
  const template = lookup(key) ?? key
  return template.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => values[name] ?? '')
}

/** English text for a step, from describeStep. */
export function describeStepEnglish(step: Step): string {
  const { key, values } = describeStep(step)
  return englishText(key, values)
}
