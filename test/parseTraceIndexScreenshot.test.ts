import fs from 'fs'
import path from 'path'
import { describe, it, expect } from 'vitest'
import { parseTraceIndex } from '../src/shared/trace/parseTraceIndex'
import { describeTraceStep } from '../src/shared/trace/describeTraceStep'
import { fromRaiderTrace } from '../src/renderer/src/foundation/trace/viewModel'

// A real ruby_raider 3.14 trace (raider_planning fixtures/trace-v1-screenshot):
// a navigate, a failed match_screenshot "home", then the failure step.
const DIR = path.join(__dirname, 'fixtures', 'trace-v1-screenshot', 'unzipped')

function screenshotFixture(): ReturnType<typeof parseTraceIndex> {
  const json = JSON.parse(fs.readFileSync(path.join(DIR, 'trace.json'), 'utf8'))
  const steps = fs.readdirSync(path.join(DIR, 'steps')).map((n) => `steps/${n}`)
  return parseTraceIndex(json, new Set(['trace.json', ...steps]))
}

describe('parseTraceIndex with a gem 3.14 trace that has a match_screenshot step', () => {
  it('keeps the name and the PNG, with no locator or snapshot', () => {
    const result = screenshotFixture()
    if (!result.ok) throw new Error(`fixture did not parse: ${result.error}`)
    const step = result.index.steps[1]
    expect(step).toMatchObject({
      index: 2,
      action: 'match_screenshot',
      name: 'home',
      status: 'failed',
      locator: null,
      screenshot: 'steps/0002.png',
      snapshot: null
    })
    expect(describeTraceStep(step)).toEqual({
      key: 'traceViewer.step.matchScreenshotFailed',
      values: { name: 'home' }
    })
  })

  it('builds a view step without an element or found-by line', () => {
    const result = screenshotFixture()
    if (!result.ok) throw new Error(`fixture did not parse: ${result.error}`)
    const vm = fromRaiderTrace(result.index, async () => ({ ok: false }) as never)
    const step = vm.steps.find((s) => s.number === 2)!
    expect(step.foundBy).toBeNull()
    expect(step.title.element).toBeUndefined()
    expect(step.hasScreenshot).toBe(true)
  })
})
