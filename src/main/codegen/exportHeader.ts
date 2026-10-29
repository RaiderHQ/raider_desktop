import { randomUUID } from 'node:crypto'
import { isStep } from '../../shared/types/step'
import type { Step } from '../../shared/types/step'
import { migrateLegacySteps } from './legacy'
import { withSecretNames } from '../../shared/secretSteps'

/**
 * Exported test files start with Ruby comments naming the test (and suite) and
 * holding its steps as one line of JSON, so an exported file imports back
 * losslessly. Files without the steps line fall back to the legacy format.
 */

const TEST = '# Test: '
const SUITE = '# Suite: '
const STEPS = '# raider-steps: '

// Header values must stay on their comment line
const oneLine = (text: string): string => text.replace(/[\r\n]+/g, ' ')

export function writeExportHeader(header: {
  testName: string
  suiteName?: string
  steps: Step[]
}): string {
  const lines = [`${TEST}${oneLine(header.testName)}`]
  if (header.suiteName !== undefined) lines.push(`${SUITE}${oneLine(header.suiteName)}`)
  // JSON.stringify escapes newlines inside strings, so this is always a single line
  lines.push(`${STEPS}${JSON.stringify(header.steps)}`)
  return `${lines.join('\n')}\n\n`
}

function parseStepsLine(json: string): Step[] | undefined {
  try {
    const parsed: unknown = JSON.parse(json)
    return Array.isArray(parsed) ? withSecretNames(parsed.filter(isStep)) : undefined
  } catch {
    return undefined
  }
}

// The format written by the original exporter: steps between `begin` and the success `puts`
function legacySteps(text: string): Step[] | undefined {
  const match = text.match(/begin\n([\s\S]*?)\n {2}puts "Test '.*' passed successfully!"/)
  if (!match) return undefined
  return migrateLegacySteps(
    match[1]
      .trim()
      .split('\n')
      .map((line) => line.trim())
  )
}

export function readExportHeader(text: string): {
  testName?: string
  suiteName?: string
  steps?: Step[]
} {
  const lines = text.split(/\r?\n/)
  const value = (prefix: string): string | undefined =>
    lines.find((l) => l.startsWith(prefix))?.slice(prefix.length)

  const stepsJson = value(STEPS)
  const steps =
    (stepsJson !== undefined ? parseStepsLine(stepsJson) : undefined) ?? legacySteps(text)
  // Legacy files may have the test comment anywhere, so fall back to a loose match
  const testName = value(TEST) ?? text.match(/# Test: (.*)/)?.[1]
  return { testName, suiteName: value(SUITE), steps }
}

/** The URL a test starts at: its first navigate step's URL, or '' when it has none. */
export function startUrl(steps: Step[]): string {
  const navigate = steps.find(
    (step): step is Extract<Step, { kind: 'navigate' }> => step.kind === 'navigate'
  )
  return navigate?.url ?? ''
}

/** Gives a fresh id to any step whose id is already taken; records the ids it keeps. */
export function withUniqueIds(steps: Step[], taken: Set<string>): Step[] {
  return steps.map((step) => {
    const unique = taken.has(step.id) ? { ...step, id: randomUUID() } : step
    taken.add(unique.id)
    return unique
  })
}
