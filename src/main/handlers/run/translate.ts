import type { ExampleStatus, PlannedTest, RunEvent } from '../../../shared/types/runEvents'

type Raw = Record<string, unknown>

/** Turns raider_reporter NDJSON lines (snake_case, v:1) into RunEvents. */
export class Translator {
  private known = new Map<string, PlannedTest>()
  /** Lines rejected for an unsupported `v` or a non-object shape. */
  badLines = 0

  constructor(
    private runId: string,
    private parallel: boolean
  ) {}

  translate(worker: number, line: unknown): RunEvent[] {
    if (typeof line !== 'object' || line === null || (line as Raw).v !== 1) {
      this.badLines += 1
      return []
    }
    const raw = line as Raw
    const w = this.parallel ? { worker } : {}
    switch (raw.type) {
      case 'plan': {
        const tests = (Array.isArray(raw.tests) ? raw.tests : []).map((t) =>
          this.remember(t as Raw)
        )
        return [{ type: 'run:planned', runId: this.runId, tests, ...w }]
      }
      case 'started': {
        const t = this.remember(raw)
        return [{ type: 'run:example', runId: this.runId, ...t, status: 'started', ...w }]
      }
      case 'finished': {
        const id = String(raw.id)
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
            status: raw.status as ExampleStatus,
            ...(typeof raw.duration_ms === 'number' ? { durationMs: raw.duration_ms } : {}),
            ...(typeof raw.attempts === 'number' ? { attempt: raw.attempts } : {}),
            ...w
          }
        ]
      }
      default:
        return []
    }
  }

  private remember(raw: Raw): PlannedTest {
    const test: PlannedTest = {
      id: String(raw.id),
      file: String(raw.file ?? ''),
      line: typeof raw.line === 'number' ? raw.line : null,
      description: String(raw.description ?? ''),
      fullName: String(raw.full_name ?? raw.description ?? '')
    }
    this.known.set(test.id, test)
    return test
  }
}
