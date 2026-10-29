import { randomUUID } from 'crypto'
import { join } from 'path'
import { writeFileSync } from 'fs'
import { webContents } from 'electron'
import { appState } from '../appState'
import { renderStep } from '../../codegen/steps'
import { toAutomation } from '../../codegen/testFile'
import type { ElementTarget, Step } from '../../../shared/types/step'
import type { TraceStep } from '../../../shared/types/traceStep'

export interface RecorderEventData {
  action: 'click' | 'type' | 'sendKeys'
  selector: string
  strategy: string
  tagName: string
  value?: string
  /** A password field: the preload sends this flag and never the value */
  secret?: boolean
  pageUrl?: string
  innerText?: string
  ariaLabel?: string
  placeholder?: string
  boundingRect?: { x: number; y: number; width: number; height: number }
}

export interface LabelHints {
  innerText?: string
  ariaLabel?: string
  placeholder?: string
}

const LABEL_MAX = 60

// DOM key names the recorder keeps; anything else (letters, modifiers) is part of typing
const RECORDABLE_KEYS = new Set([
  'Enter',
  'Tab',
  'Escape',
  'Backspace',
  'Delete',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight'
])

const clean = (text: string | undefined): string => (text ?? '').replace(/\s+/g, ' ').trim()

/** Human name for an element: its text (capped), else aria-label, else placeholder. */
function elementLabel(hints: LabelHints): string | undefined {
  const label =
    clean(hints.innerText).slice(0, LABEL_MAX) || clean(hints.ariaLabel) || clean(hints.placeholder)
  return label || undefined
}

/** Builds an ElementTarget from the recorder's selector, or null when it has none usable. */
export function toElementTarget(
  strategy: string,
  selector: string,
  hints: LabelHints
): ElementTarget | null {
  if ((strategy !== 'id' && strategy !== 'css' && strategy !== 'xpath') || !selector) return null
  const label = elementLabel(hints)
  return label ? { strategy, value: selector, label } : { strategy, value: selector }
}

/** Pure mapping from a recorder DOM event to a Step; null when the event isn't recordable. */
export function recorderEventToStep(data: RecorderEventData): Step | null {
  const element = toElementTarget(data.strategy, data.selector, data)
  if (!element) return null
  const id = randomUUID()
  switch (data.action) {
    case 'click':
      return { id, kind: 'click', element }
    case 'type':
      if (data.secret) return { id, kind: 'type', element, text: '', secret: true }
      // A SELECT change records its selected value; it gets its own step kind later
      return data.value === undefined ? null : { id, kind: 'type', element, text: data.value }
    case 'sendKeys':
      return data.value && RECORDABLE_KEYS.has(data.value)
        ? { id, kind: 'pressKey', element, key: data.value }
        : null
    default:
      return null
  }
}

function recorderEvent(data: RecorderEventData): void {
  // Ignore events triggered by the webview replay — only record real user actions
  if (appState.isReplayingInWebview) return

  const step = recorderEventToStep(data)
  if (!step) return

  appState.mainWindow?.webContents.send('new-recorded-step', step)

  // Capture trace step if trace dir is active
  if (!appState.activeTraceDir || !appState.recorderWebContentsId) return

  const traceStep: TraceStep = {
    id: randomUUID(),
    stepId: step.id,
    // The app names a secret step when it adds it, after this; the trace shows a placeholder
    command: renderStep(
      step.kind === 'type' && step.secret ? { ...step, secretName: 'RAIDER_SECRET_N' } : step,
      toAutomation(appState.projectAutomation)
    ),
    timestamp: Date.now(),
    url: data.pageUrl || '',
    elementInfo: {
      tagName: data.tagName,
      selector: data.selector,
      strategy: data.strategy,
      innerText: data.innerText,
      boundingRect: data.boundingRect
    }
  }
  const sendTrace = (extra: Partial<TraceStep> = {}): void => {
    appState.mainWindow?.webContents.send('new-trace-step', { ...traceStep, ...extra })
  }

  const screenshotPath = join(appState.activeTraceDir, `${traceStep.id}.jpg`)
  const wc = webContents.fromId(appState.recorderWebContentsId)
  if (!wc) {
    sendTrace()
    return
  }
  wc.capturePage()
    .then((nativeImage) => {
      writeFileSync(screenshotPath, nativeImage.toJPEG(60))
      sendTrace({ screenshotPath })
    })
    .catch(() => sendTrace())
}

export default recorderEvent
