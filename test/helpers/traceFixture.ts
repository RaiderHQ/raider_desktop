import fs from 'fs'
import path from 'path'
import { parseTraceIndex } from '../../src/shared/trace/parseTraceIndex'
import type { RaiderTraceIndex } from '../../src/shared/types/raiderTrace'

const DIR = path.join(__dirname, '..', 'fixtures', 'trace-v1', 'unzipped')

export function fixtureJson(): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(DIR, 'trace.json'), 'utf8'))
}

export function fixtureEntryNames(): Set<string> {
  const names = fs.readdirSync(path.join(DIR, 'steps')).map((n) => `steps/${n}`)
  return new Set(['trace.json', ...names])
}

export function fixtureIndex(): RaiderTraceIndex {
  const result = parseTraceIndex(fixtureJson(), fixtureEntryNames())
  if (!result.ok) throw new Error(`fixture did not parse: ${result.error}`)
  return result.index
}
