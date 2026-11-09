import type { Step } from '../../shared/types/step'
import type { StepLines } from '../../shared/types/projectTest'
import { withSecretNames } from '../../shared/secretSteps'
import { rubyString } from './ruby'
import { renderStep } from './steps'
import {
  appendSteps,
  copsToDisable,
  indent,
  RECORDED_MARKER,
  RUNTIME_INCLUDES,
  RUNTIME_REQUIRE,
  sha256Bytes,
  waitSetup
} from './testFile'

/** A flow does a job and checks nothing: these steps are checks. */
export class FlowHasChecksError extends Error {
  constructor(readonly stepIds: string[]) {
    super(`A flow can't hold checks: ${stepIds.length} step(s) are checks`)
    this.name = 'FlowHasChecksError'
  }
}

/**
 * The flow file (`flows/<name>_flow.rb`, run by `raider flow`) plus the lines each step
 * was written to. It uses the project's flows/flow_helper.rb driver and the 4.x runtime.
 */
export function generateFlowFileWithMap(
  flow: { name: string; steps: Step[] },
  opts: { testIdAttribute?: string }
): { content: string; stepLines: StepLines } {
  // Before rendering, so every check is named even when one is malformed
  const checks = flow.steps.filter((step) => step.kind === 'assert').map((step) => step.id)
  if (checks.length > 0) throw new FlowHasChecksError(checks)

  const named = withSecretNames(flow.steps)
  const body = named.map((step) =>
    indent(
      renderStep(step, { receiver: 'helper', testIdAttribute: opts.testIdAttribute, flow: true }),
      4
    )
  )
  const cops = copsToDisable(flow.name, body).join(', ')
  const lines = [
    '# frozen_string_literal: true',
    '',
    `${RECORDED_MARKER} Edit in Raider; editing here makes the flow code-owned.`,
    ...(cops ? [`# rubocop:disable ${cops}`] : []),
    "require_relative 'flow_helper'",
    RUNTIME_REQUIRE,
    '',
    `RSpec.describe ${rubyString(flow.name)}, flow: true do`,
    ...RUNTIME_INCLUDES,
    '',
    ...waitSetup(body),
    "  it 'runs' do"
  ]
  const ranges = appendSteps(lines, body, named)
  lines.push('  end', 'end', ...(cops ? [`# rubocop:enable ${cops}`] : []), '')
  const content = lines.join('\n')
  return { content, stepLines: { fileSha256: sha256Bytes(content), ranges } }
}
