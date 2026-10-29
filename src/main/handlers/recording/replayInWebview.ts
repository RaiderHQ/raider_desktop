import { webContents } from 'electron'
import { appState } from '../appState'
import { describeStepEnglish, englishText } from '../../../shared/describeStepEnglish'
import { isValidSecretName, secretNameOf, withSecretNames } from '../../../shared/secretSteps'
import type { ElementTarget, Step } from '../../../shared/types/step'

const POLL_INTERVAL_MS = 100
const SKIPPED = '__skipped__'

/** Map legacy key names (Ruby symbols) to DOM key names; DOM names pass through. */
const KEY_MAP: Record<string, string> = {
  enter: 'Enter',
  return: 'Enter',
  tab: 'Tab',
  escape: 'Escape',
  backspace: 'Backspace',
  delete: 'Delete',
  space: ' ',
  arrow_up: 'ArrowUp',
  arrow_down: 'ArrowDown',
  arrow_left: 'ArrowLeft',
  arrow_right: 'ArrowRight'
}

/** Every value that reaches page JS goes through JSON.stringify, so it stays a plain literal. */
const lit = (value: string): string => JSON.stringify(value)

/** A JS expression that evaluates to the element (or null) in the page. */
function findElementJS(target: ElementTarget): string {
  const value = lit(target.value)
  switch (target.strategy) {
    case 'id':
      return `document.getElementById(${value})`
    case 'xpath':
      return `document.evaluate(${value}, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue`
    default:
      return `document.querySelector(${value})`
  }
}

/** Runs an action on the element once it exists; resolves `{ found: false }` while it doesn't. */
function actionJS(target: ElementTarget, body: string): string {
  return `(() => {
    const el = ${findElementJS(target)};
    if (!el) return { found: false };
    el.scrollIntoView({ block: 'center' });
    ${body}
    return { found: true };
  })()`
}

const clickJS = (target: ElementTarget): string => actionJS(target, 'el.click();')

// The native setter bypasses React's value tracking so controlled inputs see the change
const typeJS = (target: ElementTarget, text: string): string =>
  actionJS(
    target,
    `el.focus();
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, ${lit(text)}); else el.value = ${lit(text)};
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));`
  )

// Enter on a form input submits the form unless a handler cancelled the key event
const pressKeyJS = (target: ElementTarget, key: string): string =>
  actionJS(
    target,
    `el.focus();
    const init = { key: ${lit(key)}, bubbles: true, cancelable: true };
    const downOk = el.dispatchEvent(new KeyboardEvent('keydown', init));
    const pressOk = el.dispatchEvent(new KeyboardEvent('keypress', init));
    const notCancelled = downOk && pressOk;
    if (notCancelled && init.key === 'Enter' && el.tagName === 'INPUT' && el.form) {
      el.form.requestSubmit();
    }
    el.dispatchEvent(new KeyboardEvent('keyup', init));`
  )

interface ElementSnapshot {
  found: boolean
  visible?: boolean
  enabled?: boolean
  checked?: boolean
  text?: string
  value?: string
}

const snapshotJS = (target: ElementTarget): string => `(() => {
  const el = ${findElementJS(target)};
  if (!el) return { found: false };
  const style = getComputedStyle(el);
  return {
    found: true,
    visible: el.getClientRects().length > 0 && style.visibility !== 'hidden',
    enabled: !el.disabled,
    checked: !!el.checked,
    text: (el.innerText ?? el.textContent ?? '').trim(),
    value: el.value ?? ''
  };
})()`

const pageSnapshotJS = '({ title: document.title, url: location.href })'

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

let cancelRequested = false

export function cancelWebviewReplay(): void {
  cancelRequested = true
}

type WebContents = Electron.WebContents

/**
 * Probes every 100 ms until `done` accepts the result or the budget runs out. A probe that
 * rejects or returns something malformed (e.g. mid-navigation) counts as "not yet"; the last
 * such error is reported only on timeout.
 */
async function pollUntil<T>(
  probe: () => Promise<T>,
  done: (result: T) => boolean,
  timeoutMs: number
): Promise<{ ok: boolean; last?: T; error?: string }> {
  const deadline = Date.now() + timeoutMs
  let last: T | undefined
  let error: string | undefined
  for (;;) {
    try {
      last = await probe()
      error = undefined
      if (done(last)) return { ok: true, last }
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e)
    }
    if (cancelRequested || Date.now() >= deadline) return { ok: false, last, error }
    await delay(POLL_INTERVAL_MS)
  }
}

const withError = (message: string, error?: string): string =>
  error ? `${message} (${error})` : message

/** Loads the URL and resolves once the page stops loading (or the budget runs out). */
async function navigate(wc: WebContents, url: string, timeoutMs: number): Promise<void> {
  let onStop: () => void = () => {}
  let timer: ReturnType<typeof setTimeout> | undefined
  const stopped = new Promise<void>((resolve) => {
    onStop = resolve
    timer = setTimeout(resolve, timeoutMs)
    wc.once('did-stop-loading', onStop)
  })
  try {
    await wc.loadURL(url)
    await stopped
  } finally {
    clearTimeout(timer)
    wc.removeListener('did-stop-loading', onStop)
  }
}

const requireElement = (target: ElementTarget): string =>
  `element not found: ${target.strategy}=${target.value}`

/** Runs an element action, polling until the element exists. Returns an error message or null. */
async function runAction(
  wc: WebContents,
  js: string,
  target: ElementTarget,
  timeoutMs: number
): Promise<string | null> {
  const result = await pollUntil(
    () => wc.executeJavaScript(js) as Promise<{ found: boolean }>,
    (r) => r.found,
    timeoutMs
  )
  const { ok, error } = result
  return ok ? null : withError(requireElement(target), error)
}

async function runWait(
  wc: WebContents,
  step: Extract<Step, { kind: 'wait' }>,
  timeoutMs: number
): Promise<string | null> {
  const met = (s: ElementSnapshot): boolean =>
    step.until === 'hidden'
      ? !s.found || !s.visible
      : step.until === 'enabled'
        ? !!s.found && !!s.enabled
        : !!s.found && !!s.visible
  const { ok, error } = await pollUntil(
    () => wc.executeJavaScript(snapshotJS(step.element)) as Promise<ElementSnapshot>,
    met,
    timeoutMs
  )
  if (ok) return null
  return withError(
    `timed out waiting for the element to be ${step.until}: ${step.element.strategy}=${step.element.value}`,
    error
  )
}

/** Checks one assertion against a page/element snapshot; returns the actual value on mismatch. */
function checkAssert(
  step: Extract<Step, { kind: 'assert' }>,
  s: ElementSnapshot & { title?: string; url?: string }
): { pass: boolean; expected: string; actual: string } {
  const expected = step.expected ?? ''
  const state = (on: boolean | undefined, word: string): string =>
    !s.found ? 'element not found' : on ? word : `not ${word}`
  switch (step.check) {
    case 'titleEquals':
      return { pass: s.title === expected, expected, actual: s.title ?? '' }
    case 'urlIncludes':
      return { pass: (s.url ?? '').includes(expected), expected, actual: s.url ?? '' }
    case 'displayed':
      return {
        pass: !!s.found && !!s.visible,
        expected: 'displayed',
        actual: state(s.visible, 'displayed')
      }
    case 'notDisplayed':
      return {
        pass: !s.found || !s.visible,
        expected: 'not displayed',
        actual: 'displayed'
      }
    case 'enabled':
      return {
        pass: !!s.found && !!s.enabled,
        expected: 'enabled',
        actual: state(s.enabled, 'enabled')
      }
    case 'checked':
      return {
        pass: !!s.found && !!s.checked,
        expected: 'checked',
        actual: state(s.checked, 'checked')
      }
    case 'textEquals':
      return {
        pass: !!s.found && s.text === expected,
        expected,
        actual: s.found ? (s.text ?? '') : 'element not found'
      }
    case 'textIncludes':
      return {
        pass: !!s.found && (s.text ?? '').includes(expected),
        expected: `text including ${expected}`,
        actual: s.found ? (s.text ?? '') : 'element not found'
      }
    case 'valueEquals':
      return {
        pass: !!s.found && s.value === expected,
        expected,
        actual: s.found ? (s.value ?? '') : 'element not found'
      }
    default: {
      const unsupported: never = step.check
      return {
        pass: false,
        expected: 'a supported check',
        actual: `unsupported check ${unsupported}`
      }
    }
  }
}

async function runAssert(
  wc: WebContents,
  step: Extract<Step, { kind: 'assert' }>,
  timeoutMs: number
): Promise<string | null> {
  const isPage = step.check === 'titleEquals' || step.check === 'urlIncludes'
  const script = isPage || !step.element ? pageSnapshotJS : snapshotJS(step.element)
  // Assertions retry within the wait budget, like Selenium waits, so late-rendering UI passes
  const { ok, last, error } = await pollUntil(
    async () => checkAssert(step, (await wc.executeJavaScript(script)) as ElementSnapshot),
    (r) => r.pass,
    timeoutMs
  )
  if (ok) return null
  if (!last) return withError('could not read the page', error)
  return `expected ${last.expected}, got ${last.actual}`
}

/**
 * A secret step types the value of its environment variable. When that isn't set, the
 * step fails with a message saying so rather than typing an empty password.
 */
function runSecretType(
  wc: WebContents,
  step: Extract<Step, { kind: 'type' }>,
  timeoutMs: number
): Promise<string | null> {
  const secretName = secretNameOf(step)
  // Never read a variable a secret step may not name (e.g. GITHUB_TOKEN from a shared test)
  if (!isValidSecretName(secretName)) {
    return Promise.resolve(englishText('recorder.step.secretNameRefused', { name: secretName }))
  }
  const value = process.env[secretName]
  if (value === undefined) {
    return Promise.resolve(englishText('recorder.step.secretMissing', { name: secretName }))
  }
  return runAction(wc, typeJS(step.element, value), step.element, timeoutMs)
}

/** Returns an error message, or null on success, or 'skipped' for steps replay doesn't run. */
async function runStep(wc: WebContents, step: Step, timeoutMs: number): Promise<string | null> {
  switch (step.kind) {
    case 'navigate':
      await navigate(wc, step.url, timeoutMs)
      return null
    case 'click':
      return runAction(wc, clickJS(step.element), step.element, timeoutMs)
    case 'type':
      if (step.secret) return runSecretType(wc, step, timeoutMs)
      return runAction(wc, typeJS(step.element, step.text), step.element, timeoutMs)
    case 'pressKey': {
      const key = KEY_MAP[step.key.toLowerCase()] ?? step.key
      return runAction(wc, pressKeyJS(step.element, key), step.element, timeoutMs)
    }
    case 'wait':
      return runWait(wc, step, timeoutMs)
    case 'assert':
      return runAssert(wc, step, timeoutMs)
    default:
      // custom steps hold Ruby we can't run here, and switchFrame would need cross-frame
      // scripting, which is out of scope: both are skipped and reported
      return SKIPPED
  }
}

export interface WebviewReplayResult {
  success: boolean
  error?: string
  failedStepId?: string
  cancelled?: boolean
  /** Steps replay could not run (custom code, frame switches), so the page may differ */
  skippedStepIds?: string[]
}

async function replayInWebview(
  _event: Electron.IpcMainInvokeEvent,
  stepsToReplay: Step[]
): Promise<WebviewReplayResult> {
  // Old secret steps without a stored name get the same names codegen gives them
  const steps = withSecretNames(stepsToReplay)
  cancelRequested = false
  appState.isReplayingInWebview = true
  // The flag gates recorder events, so it must be reset on every exit, including throws
  try {
    const wcId = appState.recorderWebContentsId
    if (!wcId) return { success: false, error: 'Webview not registered' }

    const wc = webContents.fromId(wcId)
    if (!wc) return { success: false, error: 'Webview web contents not found' }

    const timeoutMs = appState.recorderSettings.explicitWait * 1000
    const skippedStepIds: string[] = []

    for (let i = 0; i < steps.length; i++) {
      if (cancelRequested) return { success: false, cancelled: true }

      const step = steps[i]
      const fail = (message: string): WebviewReplayResult => ({
        success: false,
        error: `Step ${i + 1} (${describeStepEnglish(step)}): ${message}`,
        failedStepId: step.id,
        skippedStepIds
      })

      let outcome: string | null
      try {
        outcome = await runStep(wc, step, timeoutMs)
      } catch (e: unknown) {
        return fail(e instanceof Error ? e.message : String(e))
      }

      if (cancelRequested) return { success: false, cancelled: true }
      if (outcome === SKIPPED) {
        skippedStepIds.push(step.id)
        appState.mainWindow?.webContents.send('replay-progress', {
          current: i + 1,
          total: steps.length,
          skipped: true
        })
        continue
      }
      if (outcome) return fail(outcome)

      appState.mainWindow?.webContents.send('replay-progress', {
        current: i + 1,
        total: steps.length
      })
    }

    return { success: true, skippedStepIds }
  } finally {
    appState.isReplayingInWebview = false
  }
}

export default replayInWebview
