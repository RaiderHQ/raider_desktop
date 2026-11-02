// The common view model the trace components draw from. Saved raider-trace
// zips and the recorder's own traces both map into it. Screenshots and
// snapshots load lazily, once per entry; snapshots are not sanitised here
// (sanitizeSnapshot is slow, so the component runs it only when shown).

import { describeTraceStep, traceFoundBy, type TraceText } from '@shared/trace/describeTraceStep'
import type {
  RaiderTraceIndex,
  RaiderTraceStep,
  TraceEntryResult,
  TraceRect
} from '@shared/types/raiderTrace'
import type { TraceStep } from '@shared/types/traceStep'
import type { WindowApi } from '../Types/window'

export type SnapshotData = { kind: 'html' | 'xml'; text: string }

// Each loaded entry names the step it was for, so a consumer can drop a result
// that arrives after the selection moved on.
export type LoadedScreenshot = { stepId: string; dataUrl: string }
export type LoadedSnapshot = { stepId: string; snapshot: SnapshotData }

export interface TraceViewStep {
  id: string
  number: number
  title?: ReturnType<typeof describeTraceStep> // plain words; absent for recorder steps
  status: 'passed' | 'failed' | 'other'
  isGroup: boolean
  offsetMs: number // since the trace started
  waitedMs: number | null
  retries: number
  foundBy: TraceText | null
  rect: TraceRect | null // set only when it may be drawn (see shouldDrawRect)
  hasScreenshot: boolean
  hasSnapshot: boolean
  loadScreenshot?: () => Promise<LoadedScreenshot | null>
  loadSnapshot?: () => Promise<LoadedSnapshot | null>
  children: TraceViewStep[]
  stepIndices: number[] // this step and its descendants, for filtering events
  // For Technical details only: on a secret step, element.label and
  // error.message may echo the secret, so never show raw in the main view.
  raw: RaiderTraceStep | null
}

export interface TraceView {
  steps: TraceViewStep[]
  byId: Map<string, TraceViewStep>
  defaultSelectedId: string | null
  devicePixelRatio: number
}

// Memoises a loader per entry name. A failed load (null or a throw) resolves
// null and is dropped from the cache, so it can be retried.
function memo<T>(load: (name: string) => Promise<T | null>): (name: string) => Promise<T | null> {
  const cache = new Map<string, Promise<T | null>>()
  return (name) => {
    let promise = cache.get(name)
    if (!promise) {
      promise = load(name)
        .catch(() => null)
        .then((value) => {
          if (value === null) cache.delete(name)
          return value
        })
      cache.set(name, promise)
    }
    return promise
  }
}

/**
 * The rect is where the element was before the action, so it is drawn only
 * when the page didn't change: same url as the previous step in the trace.
 */
export function shouldDrawRect(
  step: RaiderTraceStep,
  previous: RaiderTraceStep | undefined
): boolean {
  return previous !== undefined && step.rect !== null && step.url === previous.url
}

const usable = (n: number): boolean => Number.isFinite(n) && n > 0

/**
 * The rect as percentages of the screenshot, clamped to it. The rect is in CSS
 * pixels and the screenshot in device pixels, so it is scaled by the image's
 * natural size and the device pixel ratio, never by the viewport. Null when the
 * size or ratio can't place it.
 */
export function rectOverlayStyle(
  rect: TraceRect,
  dpr: number,
  natural: { width: number; height: number }
): { left: string; top: string; width: string; height: string } | null {
  if (!usable(dpr) || !usable(natural.width) || !usable(natural.height)) return null
  if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)) return null
  const pct = (value: number, size: number): number =>
    Math.min(100, Math.max(0, ((value * dpr) / size) * 100))
  const left = pct(rect.x, natural.width)
  const top = pct(rect.y, natural.height)
  const right = pct(rect.x + rect.width, natural.width)
  const bottom = pct(rect.y + rect.height, natural.height)
  return {
    left: `${left}%`,
    top: `${top}%`,
    width: `${Math.max(0, right - left)}%`,
    height: `${Math.max(0, bottom - top)}%`
  }
}

/**
 * Network or console entries for a step and its children, or all of them.
 * Entries with no step (stepIndex null) only show with all.
 */
export function eventsForStep<T extends { stepIndex: number | null }>(
  items: T[],
  step: TraceViewStep | null,
  all: boolean
): T[] {
  if (all) return items
  if (!step) return []
  const indices = new Set(step.stepIndices)
  return items.filter((item) => item.stepIndex !== null && indices.has(item.stepIndex))
}

function viewStatus(status: string): TraceViewStep['status'] {
  return status === 'passed' || status === 'failed' ? status : 'other'
}

function collectIndices(step: TraceViewStep, seen = new Set<TraceViewStep>()): number[] {
  if (seen.has(step)) return []
  seen.add(step)
  return [step.number, ...step.children.flatMap((child) => collectIndices(child, seen))]
}

export function fromRaiderTrace(
  index: RaiderTraceIndex,
  read: (name: string) => Promise<TraceEntryResult>
): TraceView {
  const loadImage = memo(async (name) => {
    const result = await read(name)
    return result.ok && result.kind === 'image' ? result.dataUrl : null
  })
  const loadText = memo<SnapshotData>(async (name) => {
    const result = await read(name)
    return result.ok && result.kind !== 'image' ? { kind: result.kind, text: result.text } : null
  })

  const byId = new Map<string, TraceViewStep>()
  const byIndex = new Map<number, TraceViewStep>()
  const steps: TraceViewStep[] = []
  let lastFailed: TraceViewStep | null = null

  for (const [i, raw] of index.steps.entries()) {
    // Task 2 validates the index; this stays safe on its own regardless. A
    // repeated index is dropped, and a parent counts only when it is an earlier
    // group, so the tree can't loop.
    if (byIndex.has(raw.index)) continue
    const parent = raw.parentIndex !== null ? byIndex.get(raw.parentIndex) : undefined
    const id = `step-${raw.index}`
    const { screenshot, snapshot } = raw
    const offsetMs =
      raw.startedAtMs !== null && index.startedAtMs !== null
        ? Math.max(0, raw.startedAtMs - index.startedAtMs)
        : 0
    const step: TraceViewStep = {
      id,
      number: raw.index,
      title: describeTraceStep(raw),
      status: viewStatus(raw.status),
      isGroup: raw.kind === 'group',
      offsetMs,
      waitedMs: raw.waitedMs,
      retries: raw.retries,
      foundBy: traceFoundBy(raw.locator),
      rect: shouldDrawRect(raw, index.steps[i - 1]) ? raw.rect : null,
      hasScreenshot: screenshot !== null,
      hasSnapshot: snapshot !== null,
      loadScreenshot:
        screenshot !== null
          ? async () => {
              const dataUrl = await loadImage(screenshot)
              return dataUrl === null ? null : { stepId: id, dataUrl }
            }
          : undefined,
      loadSnapshot:
        snapshot !== null
          ? async () => {
              const data = await loadText(snapshot)
              return data === null ? null : { stepId: id, snapshot: data }
            }
          : undefined,
      children: [],
      stepIndices: [],
      raw
    }
    byId.set(id, step)
    byIndex.set(raw.index, step)
    ;(parent?.isGroup ? parent.children : steps).push(step)
    // Parents come before their children, so the last failure is the deepest.
    if (step.status === 'failed') lastFailed = step
  }
  for (const step of byId.values()) step.stepIndices = collectIndices(step)

  const fallback = steps.length > 0 ? steps[steps.length - 1] : null
  return {
    steps,
    byId,
    defaultSelectedId: (lastFailed ?? fallback)?.id ?? null,
    devicePixelRatio: index.devicePixelRatio
  }
}

export function fromRecorderTrace(
  steps: TraceStep[],
  readImage: WindowApi['readImage']
): TraceViewStep[] {
  const loadImage = memo(async (path) => {
    const result = await readImage(path)
    return result.success && result.data
      ? `data:image/${result.fileExt || 'jpeg'};base64,${result.data}`
      : null
  })
  const start = steps.length > 0 ? steps[0].timestamp : 0
  return steps.map((step, i) => {
    const { screenshotPath } = step
    return {
      id: step.id,
      number: i + 1,
      status: 'other',
      isGroup: false,
      offsetMs: Math.max(0, step.timestamp - start),
      waitedMs: null,
      retries: 0,
      foundBy: null,
      rect: null,
      hasScreenshot: Boolean(screenshotPath),
      hasSnapshot: false,
      loadScreenshot: screenshotPath
        ? async () => {
            const dataUrl = await loadImage(screenshotPath)
            return dataUrl === null ? null : { stepId: step.id, dataUrl }
          }
        : undefined,
      children: [],
      stepIndices: [],
      raw: null
    }
  })
}
