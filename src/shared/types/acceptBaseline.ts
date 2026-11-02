export type AcceptBaselineError = 'notFound' | 'denied' | 'cancelled' | 'writeFailed'

export type AcceptBaselineResult =
  /** path is relative to the project root; unchanged: the baseline already held these bytes */
  { ok: true; path: string; unchanged: boolean } | { ok: false; error: AcceptBaselineError }
