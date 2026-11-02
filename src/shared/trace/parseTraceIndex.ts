import {
  TRACE_ENTRY_NAME,
  type RaiderTraceConsole,
  type RaiderTraceIndex,
  type RaiderTraceNetwork,
  type RaiderTraceStep,
  type TraceElement,
  type TraceErrorInfo,
  type TraceLocator,
  type TraceRect
} from '../types/raiderTrace'

// Validates a parsed trace.json. The file comes from anywhere, so nothing is
// trusted: only known fields are copied, strings are capped, and no input throws.

const MAX_TEXT = 16 * 1024
const MAX_WITHIN = 32
const MAX_STEPS = 5000
const MAX_NETWORK = 10000
const MAX_CONSOLE = 10000

type Obj = Record<string, unknown>

function obj(v: unknown): Obj | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Obj) : null
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v.slice(0, MAX_TEXT) : undefined
}

function strOrNull(v: unknown): string | null {
  return str(v) ?? null
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function count(v: unknown): number {
  const n = num(v)
  return n !== null && n > 0 ? n : 0
}

function int(v: unknown): number | null {
  return typeof v === 'number' && Number.isSafeInteger(v) ? v : null
}

// Step indices start at 1; anything else counts as missing.
function stepIndex(v: unknown): number | null {
  const n = int(v)
  return n !== null && n >= 1 ? n : null
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback
}

function timeMs(v: unknown): number | null {
  if (typeof v !== 'string') return null
  const ms = Date.parse(v.slice(0, 64))
  return Number.isNaN(ms) ? null : ms
}

function errorInfo(v: unknown): TraceErrorInfo | null {
  const o = obj(v)
  if (!o || typeof o.class !== 'string' || typeof o.message !== 'string') return null
  return { className: o.class.slice(0, MAX_TEXT), message: o.message.slice(0, MAX_TEXT) }
}

function locatorPair(v: unknown): { strategy: string; selector: string } | null {
  const o = obj(v)
  if (!o || typeof o.strategy !== 'string' || typeof o.selector !== 'string') return null
  return { strategy: o.strategy.slice(0, MAX_TEXT), selector: o.selector.slice(0, MAX_TEXT) }
}

function locator(v: unknown): TraceLocator | null {
  const pair = locatorPair(v)
  if (!pair) return null
  const within = arr(obj(v)!.within)
    .slice(0, MAX_WITHIN)
    .map(locatorPair)
    .filter((p): p is { strategy: string; selector: string } => p !== null)
  return { ...pair, within }
}

function element(v: unknown): TraceElement | null {
  const o = obj(v)
  if (!o) return null
  const out: TraceElement = {}
  const tag = str(o.tag)
  const label = str(o.label)
  const role = str(o.role)
  if (tag !== undefined) out.tag = tag
  if (label !== undefined) out.label = label
  if (role !== undefined) out.role = role
  return out
}

function rect(v: unknown): TraceRect | null {
  const o = obj(v)
  if (!o) return null
  const [x, y, width, height] = [o.x, o.y, o.width, o.height].map(num)
  if (x === null || y === null || width === null || height === null) return null
  return { x, y, width, height }
}

function source(v: unknown): { file: string; line: number } | null {
  const o = obj(v)
  if (!o || typeof o.file !== 'string') return null
  const line = num(o.line)
  return line === null ? null : { file: o.file.slice(0, MAX_TEXT), line }
}

// An entry is kept only when the name is allowed, the entry exists and its
// extension fits the field.
function entry(v: unknown, extensions: RegExp, names: ReadonlySet<string>): string | null {
  if (typeof v !== 'string') return null
  if (v === 'trace.json' || !TRACE_ENTRY_NAME.test(v)) return null
  if (!extensions.test(v) || !names.has(v)) return null
  return v
}

function parseStep(
  o: Obj,
  index: number,
  groupsSeen: ReadonlySet<number>,
  names: ReadonlySet<string>
): RaiderTraceStep {
  const parent = stepIndex(o.parent_index)
  const action = str(o.action) ?? ''
  // Fails closed: anything but an explicit false (or absent) is secret.
  const secret = !(o.secret === undefined || o.secret === false)
  const value = secret ? null : strOrNull(o.value)
  const step: RaiderTraceStep = {
    index,
    parentIndex: parent !== null && groupsSeen.has(parent) ? parent : null,
    kind: str(o.kind) ?? '',
    action,
    locator: locator(o.locator),
    element: element(o.element),
    value,
    secret,
    url: strOrNull(o.url),
    pageTitle: strOrNull(o.page_title),
    startedAtMs: timeMs(o.started_at),
    durationMs: num(o.duration_ms),
    waitedMs: num(o.waited_ms),
    retries: count(o.retries),
    status: str(o.status) ?? '',
    error: errorInfo(o.error),
    source: source(o.source),
    rect: rect(o.rect),
    screenshot: entry(o.screenshot, /\.(jpg|png)$/, names),
    snapshot: entry(o.snapshot, /\.(html|xml)$/, names)
  }
  const name = str(o.name)
  if (action === 'cucumber_step' && name !== undefined) step.name = name
  return step
}

function parseSteps(
  v: unknown,
  names: ReadonlySet<string>
): { steps: RaiderTraceStep[]; dropped: number } {
  const steps: RaiderTraceStep[] = []
  const seen = new Set<number>()
  const groups = new Set<number>()
  const all = arr(v)
  for (const raw of all.slice(0, MAX_STEPS)) {
    const o = obj(raw)
    const index = o ? stepIndex(o.index) : null
    if (!o || index === null || seen.has(index)) continue
    const step = parseStep(o, index, groups, names)
    seen.add(index)
    if (step.kind === 'group') groups.add(index)
    steps.push(step)
  }
  return { steps, dropped: Math.max(0, all.length - MAX_STEPS) }
}

// A missing, invalid or < 1 step_index means the entry came before the first
// step, so it belongs to step 1. An index naming no real step is an orphan (null).
function owner(v: unknown, known: ReadonlySet<number>, first: number | null): number | null {
  const n = stepIndex(v)
  if (n === null) return first
  return known.has(n) ? n : null
}

function parseNetwork(
  v: unknown,
  known: ReadonlySet<number>,
  first: number | null
): { entries: RaiderTraceNetwork[]; dropped: number } {
  const out: RaiderTraceNetwork[] = []
  const all = arr(v)
  for (const raw of all.slice(0, MAX_NETWORK)) {
    const o = obj(raw)
    if (!o) continue
    out.push({
      stepIndex: owner(o.step_index, known, first),
      method: str(o.method) ?? '',
      url: str(o.url) ?? '',
      status: num(o.status),
      mimeType: strOrNull(o.mime_type),
      durationMs: num(o.duration_ms),
      bytes: num(o.bytes),
      error: strOrNull(o.error)
    })
  }
  return { entries: out, dropped: Math.max(0, all.length - MAX_NETWORK) }
}

function parseConsole(
  v: unknown,
  known: ReadonlySet<number>,
  first: number | null
): { entries: RaiderTraceConsole[]; dropped: number } {
  const out: RaiderTraceConsole[] = []
  const all = arr(v)
  for (const raw of all.slice(0, MAX_CONSOLE)) {
    const o = obj(raw)
    if (!o) continue
    out.push({
      stepIndex: owner(o.step_index, known, first),
      level: str(o.level) ?? '',
      text: str(o.text) ?? '',
      source: strOrNull(o.source)
    })
  }
  return { entries: out, dropped: Math.max(0, all.length - MAX_CONSOLE) }
}

export function parseTraceIndex(
  json: unknown,
  entryNames: ReadonlySet<string>
): { ok: true; index: RaiderTraceIndex } | { ok: false; error: 'notTrace' | 'newerVersion' } {
  try {
    const root = obj(json)
    if (!root || root.format !== 'raider-trace') return { ok: false, error: 'notTrace' }
    const version = root.version
    if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
      return { ok: false, error: 'notTrace' }
    }
    if (version > 1) return { ok: false, error: 'newerVersion' }

    const test = obj(root.test) ?? {}
    const browser = obj(root.browser) ?? {}
    const caps = obj(root.capabilities) ?? {}
    const trunc = obj(root.truncated) ?? {}
    const dpr = num(root.device_pixel_ratio)
    const parsedSteps = parseSteps(root.steps, entryNames)
    const known = new Set(parsedSteps.steps.map((st) => st.index))
    const first = known.has(1) ? 1 : (parsedSteps.steps[0]?.index ?? null)
    const network = parseNetwork(root.network, known, first)
    const consoleLog = parseConsole(root.console, known, first)

    const index: RaiderTraceIndex = {
      version: 1,
      test: {
        fullName: str(test.full_name) ?? '',
        status: str(test.status) ?? '',
        error: errorInfo(test.error)
      },
      browser: {},
      devicePixelRatio: dpr !== null && dpr > 0 ? dpr : 1,
      startedAtMs: timeMs(root.started_at),
      capabilities: {
        network: bool(caps.network, true),
        console: bool(caps.console, true),
        screenshots: bool(caps.screenshots, true),
        snapshots: bool(caps.snapshots, true)
      },
      truncated: {
        steps: count(trunc.steps) + parsedSteps.dropped,
        screenshots: count(trunc.screenshots),
        snapshots: count(trunc.snapshots),
        network: count(trunc.network) + network.dropped,
        console: count(trunc.console) + consoleLog.dropped
      },
      steps: parsedSteps.steps,
      network: network.entries,
      console: consoleLog.entries
    }
    const identifier = str(test.identifier)
    if (identifier !== undefined) index.test.identifier = identifier
    const attempt = int(test.attempt)
    if (attempt !== null) index.test.attempt = attempt
    const bName = str(browser.name)
    const bVersion = str(browser.version)
    if (bName !== undefined) index.browser.name = bName
    if (bVersion !== undefined) index.browser.version = bVersion
    return { ok: true, index }
  } catch {
    return { ok: false, error: 'notTrace' }
  }
}
