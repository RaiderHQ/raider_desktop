import { renderStep } from '../../codegen/steps'
import { appState } from '../appState'
import type { Step } from '../../../shared/types/step'

/**
 * The Ruby for one step, for the code view. `options.flow` must be exactly `true` for a
 * flow's rendering (a typed input reads flow_input); anything else renders as in a test.
 */
export function renderStepHandler(step: Step, options?: unknown): string {
  const flow =
    typeof options === 'object' &&
    options !== null &&
    !Array.isArray(options) &&
    (options as { flow?: unknown }).flow === true
  return renderStep(step, { testIdAttribute: appState.layout?.testIdAttribute, flow })
}
