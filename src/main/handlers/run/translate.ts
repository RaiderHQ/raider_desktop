import type { ExampleStatus, PlannedTest, RunEvent } from '../../../shared/types/runEvents'

type Raw = Record<string, unknown>

const FINISHED_STATUSES: readonly string[] = [
  'passed',
  'failed',
  'quarantined',
  'pending',
  'skipped'
]

function isRaw(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Turns raider_reporter NDJSON lines (snake_case, v:1) into RunEvents. */
export class Translator {
  private known = new Map<string, PlannedTest>()
  /** Lines (or plan entries) rejected as malformed or unsupported. */
  badLines = 0

  constructor(
    private runId: string,
    private parallel: boolean,
    private onBadLine?: () => void
  ) {}

  translate(worker: number, line: unknown): RunEvent[] {
    if (!isRaw(line) || line.v !== 1) return this.bad()
    const w = this.parallel ? { worker } : {}
    switch (line.type) {
      case 'plan': {
        if (!Array.isArray(line.tests)) return this.bad()
        const tests: PlannedTest[] = []
        for (const entry of line.tests) {
          const t = this.remember(entry)
          if (t) tests.push(t)
          else this.bad()
        }
        return [{ type: 'run:planned', runId: this.runId, tests, ...w }]
      }
      case 'started': {
        const t = this.remember(line)
        if (!t) return this.bad()
        return [{ type: 'run:example', runId: this.runId, ...t, status: 'started', ...w }]
      }
      case 'finished': {
        if (typeof line.id !== 'string' || !line.id) return this.bad()
        if (typeof line.status !== 'string' || !FINISHED_STATUSES.includes(line.status)) {
          return this.bad()
        }
        const id = line.id
        const t = this.known.get(id) ?? {
          id,
          file: '',
          line: null,
          description: id,
          fullName: id
        }
        return [
          {
            type: 'run:example',
            runId: this.runId,
            ...t,
            status: line.status as ExampleStatus,
            ...(typeof line.duration_ms === 'number' ? { durationMs: line.duration_ms } : {}),
            ...(typeof line.attempts === 'number' ? { attempt: line.attempts } : {}),
            ...w
          }
        ]
      }
      default:
        return []
    }
  }

  private bad(): RunEvent[] {
    this.badLines += 1
    try {
      this.onBadLine?.()
    } catch {
      // a throwing callback must not break translation
    }
    return []
  }

  /** Validates a test entry and remembers it by id; null when malformed. */
  private remember(raw: unknown): PlannedTest | null {
    if (!isRaw(raw) || typeof raw.id !== 'string' || !raw.id) return null
    const description = typeof raw.description === 'string' ? raw.description : ''
    const test: PlannedTest = {
      id: raw.id,
      file: typeof raw.file === 'string' ? raw.file : '',
      line: typeof raw.line === 'number' ? raw.line : null,
      description,
      fullName: typeof raw.full_name === 'string' ? raw.full_name : description
    }
    this.known.set(test.id, test)
    return test
  }
}
