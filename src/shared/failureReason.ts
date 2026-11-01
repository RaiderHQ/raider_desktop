import { THIS_ELEMENT } from './describeStep'
import type { Step } from './types/step'

export interface FailureReason {
  key: string
  params: Record<string, string>
  actualValue?: string
}

const R = 'failedStep.reason.'
const STILL_FAILING = /^\(still failing after \d+(?:\.\d+)?s\)\n/
const QUOTED = '"(?:[^"\\\\]|\\\\.)*"'
const INCLUDE_RE = new RegExp(`^expected (${QUOTED}) to include (${QUOTED})`)
const NETWORK_RE = /ECONNREFUSED|Net::ReadTimeout|UnknownHost/

const reason = (name: string, params: Record<string, string> = {}): FailureReason => ({
  key: R + name,
  params
})

/** The wait helper's `last seen:` state, matched by prefix. */
const waitHelperReason = (message: string): string => {
  const state = /last seen:\s*(.+)$/.exec(message)?.[1] ?? ''
  if (state.startsWith('not found')) return 'notFound'
  if (state.startsWith('present but not visible')) return 'hidden'
  if (state.startsWith('visible but disabled')) return 'disabled'
  if (state.startsWith('click intercepted')) return 'covered'
  return 'unusable'
}

const unquote = (printed: string): string | undefined =>
  /^"[\s\S]*"$/.test(printed) && printed.length >= 2
    ? printed.slice(1, -1).replace(/\\(["\\])/g, '$1')
    : undefined

const expectation = (message: string): FailureReason | null => {
  const include = INCLUDE_RE.exec(message)
  const got = /expected: (.+)\n\s*got: (.+)/.exec(message)
  const printed = include
    ? { expected: include[2].trim(), actual: include[1].trim() }
    : got
      ? { expected: got[1].trim(), actual: got[2].trim() }
      : null
  if (!printed) return null
  const actualValue = unquote(printed.actual)
  const result = reason('expected', printed)
  return actualValue === undefined ? result : { ...result, actualValue }
}

/** The plain-language reason a recorded step failed, as an i18n key plus values. */
export function failureReason(
  failure: { exceptionClass?: string; message: string },
  step: Step,
  element: string
): FailureReason {
  const cls = failure.exceptionClass ?? ''
  const message = failure.message.replace(STILL_FAILING, '')
  const isThis = !element || element === THIS_ELEMENT
  const params = { element: isThis ? THIS_ELEMENT : `"${element}"` }

  if (
    cls.includes('NoSuchElementError') ||
    cls.includes('UnknownObjectException') ||
    message.includes('Unable to locate')
  )
    return reason('notFound', params)

  if (cls.includes('WaitHelper::TimeoutError') || /^Waited \d+(?:\.\d+)?s for /.test(message))
    return reason(waitHelperReason(message), params)

  if (cls.includes('TimeoutError') && ['click', 'type', 'pressKey', 'wait'].includes(step.kind))
    return reason('timedOut', params)

  if (
    cls.includes('ElementNotInteractable') ||
    cls.includes('ElementClickIntercepted') ||
    cls.includes('ObjectDisabledException')
  )
    return reason('notInteractable', params)

  if (cls.includes('StaleElementReference'))
    return reason('stale', { element: isThis ? 'This element' : params.element })

  if (cls.includes('ExpectationNotMetError') && step.kind === 'assert')
    return expectation(message) ?? reason('checkFailed', params)

  if (step.kind === 'navigate' && (NETWORK_RE.test(cls) || NETWORK_RE.test(message)))
    return reason('cantOpen', { url: step.url })

  return reason('generic')
}
