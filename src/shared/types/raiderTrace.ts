// The raider-trace v1 index (trace.json) as the viewer holds it, after validation.
export const TRACE_CONTENT_TYPE = 'application/vnd.raider.trace+zip'

// Entry names a trace zip may contain.
export const TRACE_ENTRY_NAME = /^trace\.json$|^steps\/\d{4}\.(jpg|png|html|xml)$/

export interface TraceErrorInfo {
  className: string
  message: string
}

export interface TraceRect {
  x: number
  y: number
  width: number
  height: number
}

export interface TraceLocator {
  strategy: string
  selector: string
  within: { strategy: string; selector: string }[] // outermost first
}

export interface TraceElement {
  tag?: string
  label?: string
  role?: string
}

// A secret step has value null, and its value is never shown anywhere. Its
// element.label names the field, not the value, so it may appear in the step's
// title. Its error.message may echo the secret: Technical details only.
export interface RaiderTraceStep {
  index: number
  parentIndex: number | null
  kind: string
  action: string
  name?: string // Gherkin text, only on cucumber_step groups
  locator: TraceLocator | null
  element: TraceElement | null
  value: string | null // always null when secret
  secret: boolean
  url: string | null
  pageTitle: string | null
  startedAtMs: number | null
  durationMs: number | null
  waitedMs: number | null
  retries: number
  status: string
  error: TraceErrorInfo | null
  source: { file: string; line: number } | null
  rect: TraceRect | null
  screenshot: string | null
  snapshot: string | null
}

export interface RaiderTraceNetwork {
  stepIndex: number | null // null: belongs to no step
  method: string
  url: string
  status: number | null
  mimeType: string | null
  durationMs: number | null
  bytes: number | null
  error: string | null
  // Set when a network mock in the test answered the request ('fulfilled') or
  // failed it ('failed'); null when the request reached the server.
  mocked: RaiderTraceMocked | null
}

export type RaiderTraceMocked = 'fulfilled' | 'failed'

export interface RaiderTraceConsole {
  stepIndex: number | null // null: belongs to no step
  level: string
  text: string
  source: string | null
}

export interface RaiderTraceIndex {
  version: 1
  test: {
    identifier?: string
    fullName: string
    status: string
    attempt?: number
    error: TraceErrorInfo | null
  }
  browser: { name?: string; version?: string }
  devicePixelRatio: number
  startedAtMs: number | null
  capabilities: { network: boolean; console: boolean; screenshots: boolean; snapshots: boolean }
  truncated: { steps: number; screenshots: number; snapshots: number; network: number; console: number }
  steps: RaiderTraceStep[]
  network: RaiderTraceNetwork[]
  console: RaiderTraceConsole[]
}

export type TraceOpenError =
  | 'notFound'
  | 'tooLarge'
  | 'unsafe'
  | 'notTrace'
  | 'newerVersion'
  | 'damaged'

export type ResultTraceSource = { kind: 'result'; path: string }

// 'file' (picked or dropped) is opened in main only; the renderer can't name one.
export type TraceSource = ResultTraceSource | { kind: 'file'; path: string }

export type TraceOpenResult =
  | { ok: true; traceId: string; index: RaiderTraceIndex }
  | { ok: false; error: TraceOpenError }

export type TraceEntryResult =
  | { ok: true; kind: 'image'; dataUrl: string }
  | { ok: true; kind: 'html' | 'xml'; text: string }
  | { ok: false; error: 'closed' | 'notCaptured' | 'damaged' }
