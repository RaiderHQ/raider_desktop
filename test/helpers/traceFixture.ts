import fs from 'fs'
import path from 'path'
import { parseTraceIndex } from '../../src/shared/trace/parseTraceIndex'
import type { RaiderTraceIndex } from '../../src/shared/types/raiderTrace'

// trace-v1: a ruby_raider 3.13 trace (groups, read steps), kept so the parser's
// tolerance of the old vocabulary stays tested. trace-v1-runtime: a ruby_raider
// 4.0.0 trace, the shape the runtime writes today.
export type FixtureName = 'trace-v1' | 'trace-v1-runtime'

const dir = (name: FixtureName): string => path.join(__dirname, '..', 'fixtures', name, 'unzipped')

export function fixtureJson(name: FixtureName = 'trace-v1'): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(dir(name), 'trace.json'), 'utf8'))
}

export function fixtureEntryNames(name: FixtureName = 'trace-v1'): Set<string> {
  const names = fs.readdirSync(path.join(dir(name), 'steps')).map((n) => `steps/${n}`)
  return new Set(['trace.json', ...names])
}

export function fixtureIndex(name: FixtureName = 'trace-v1'): RaiderTraceIndex {
  const result = parseTraceIndex(fixtureJson(name), fixtureEntryNames(name))
  if (!result.ok) throw new Error(`fixture ${name} did not parse: ${result.error}`)
  return result.index
}

/** The 4.0.0 runtime trace. */
export const runtimeFixtureIndex = (): RaiderTraceIndex => fixtureIndex('trace-v1-runtime')
