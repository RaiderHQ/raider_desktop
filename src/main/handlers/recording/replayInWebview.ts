import { webContents } from 'electron'
import { appState } from '../appState'

interface ReplayStepAction {
  type: 'navigate' | 'click' | 'type' | 'sendKey' | 'sleep' | 'executeScript' | 'unknown'
  url?: string
  strategy?: string
  value?: string
  text?: string
  key?: string
  script?: string
  seconds?: number
}

/** Map Ruby Selenium key symbols to DOM key names */
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

function parseStep(step: string): ReplayStepAction {
  // @driver.get("url")
  let match = step.match(/@driver\.get\("([^"]+)"\)/)
  if (match) return { type: 'navigate', url: match[1] }

  // @driver.find_element(:strategy, "value").click
  match = step.match(
    /@driver\.find_element\(:?(\w+),\s*(?:%q\((.+?)\)|"((?:\\"|[^"])*)")\)\.click/
  )
  if (match) return { type: 'click', strategy: match[1], value: match[2] || match[3] }

  // @driver.find_element(:strategy, "value").send_keys(:key)
  match = step.match(
    /@driver\.find_element\(:?(\w+),\s*(?:%q\((.+?)\)|"((?:\\"|[^"])*)")\)\.send_keys\(:(\w+)\)/
  )
  if (match)
    return { type: 'sendKey', strategy: match[1], value: match[2] || match[3], key: match[4] }

  // @driver.find_element(:strategy, "value").send_keys("text")
  match = step.match(
    /@driver\.find_element\(:?(\w+),\s*(?:%q\((.+?)\)|"((?:\\"|[^"])*)")\)\.send_keys\("([^"]*)"\)/
  )
  if (match)
    return { type: 'type', strategy: match[1], value: match[2] || match[3], text: match[4] }

  // sleep(N)
  match = step.match(/sleep\(([\d.]+)\)/)
  if (match) return { type: 'sleep', seconds: parseFloat(match[1]) }

  // @driver.execute_script("...")
  match = step.match(/@driver\.execute_script\("([^"]+)"\)/)
  if (match) return { type: 'executeScript', script: match[1] }

  // Skip assertions and waits during replay — they are verification, not actions
  if (step.startsWith('expect(') || step.includes('wait.until')) {
    return { type: 'sleep', seconds: 0 }
  }

  return { type: 'unknown' }
}

/** Build a JS snippet that finds an element by Selenium strategy + value */
function buildFindElementJS(strategy: string, value: string): string {
  const escaped = value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  switch (strategy) {
    case 'css':
      return `document.querySelector('${escaped}')`
    case 'id':
      return `document.getElementById('${escaped}')`
    case 'name':
      return `document.querySelector('[name="${escaped}"]')`
    case 'class_name':
      return `document.querySelector('.${escaped}')`
    case 'tag_name':
      return `document.querySelector('${escaped}')`
    case 'xpath': {
      return `document.evaluate('${escaped}', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue`
    }
    case 'link_text':
      return `Array.from(document.querySelectorAll('a')).find(a => a.textContent.trim() === '${escaped}')`
    case 'partial_link_text':
      return `Array.from(document.querySelectorAll('a')).find(a => a.textContent.includes('${escaped}'))`
    default:
      return `document.querySelector('${escaped}')`
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

let cancelRequested = false

export function cancelWebviewReplay(): void {
  cancelRequested = true
}

async function replayInWebview(
  _event: Electron.IpcMainInvokeEvent,
  steps: string[]
): Promise<{ success: boolean; error?: string; cancelled?: boolean }> {
  cancelRequested = false
  appState.isReplayingInWebview = true
  const wcId = appState.recorderWebContentsId
  if (!wcId) {
    appState.isReplayingInWebview = false
    return { success: false, error: 'Webview not registered' }
  }

  const wc = webContents.fromId(wcId)
  if (!wc) {
    appState.isReplayingInWebview = false
    return { success: false, error: 'Webview web contents not found' }
  }

  for (let i = 0; i < steps.length; i++) {
    if (cancelRequested) {
      appState.isReplayingInWebview = false
      return { success: false, cancelled: true }
    }

    const action = parseStep(steps[i])

    try {
      switch (action.type) {
        case 'navigate':
          await wc.loadURL(action.url!)
          // Small pause after navigation for page to settle
          await delay(500)
          break

        case 'click': {
          const findEl = buildFindElementJS(action.strategy!, action.value!)
          await wc.executeJavaScript(`
            (() => {
              const el = ${findEl};
              if (!el) throw new Error('Element not found: ${action.strategy}=${action.value}');
              el.scrollIntoView({ block: 'center' });
              el.click();
            })()
          `)
          await delay(300)
          break
        }

        case 'type': {
          const findEl = buildFindElementJS(action.strategy!, action.value!)
          const escapedText = (action.text || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")
          await wc.executeJavaScript(`
            (() => {
              const el = ${findEl};
              if (!el) throw new Error('Element not found: ${action.strategy}=${action.value}');
              el.scrollIntoView({ block: 'center' });
              el.focus();
              el.value = '${escapedText}';
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
            })()
          `)
          await delay(200)
          break
        }

        case 'sendKey': {
          const findEl = buildFindElementJS(action.strategy!, action.value!)
          const domKey = KEY_MAP[action.key!] || action.key!
          await wc.executeJavaScript(`
            (() => {
              const el = ${findEl};
              if (!el) throw new Error('Element not found: ${action.strategy}=${action.value}');
              el.scrollIntoView({ block: 'center' });
              el.focus();
              el.dispatchEvent(new KeyboardEvent('keydown', { key: '${domKey}', bubbles: true }));
              el.dispatchEvent(new KeyboardEvent('keyup', { key: '${domKey}', bubbles: true }));
            })()
          `)
          await delay(200)
          break
        }

        case 'sleep':
          if (action.seconds! > 0) await delay(action.seconds! * 1000)
          break

        case 'executeScript':
          await wc.executeJavaScript(action.script!)
          await delay(200)
          break

        case 'unknown':
          // Skip unrecognized steps
          break
      }

      // Notify renderer of progress
      appState.mainWindow?.webContents.send('replay-progress', { current: i + 1, total: steps.length })
    } catch (e: unknown) {
      appState.isReplayingInWebview = false
      const errorMsg = e instanceof Error ? e.message : String(e)
      return { success: false, error: `Step ${i + 1} failed: ${errorMsg}` }
    }
  }

  appState.isReplayingInWebview = false
  return { success: true }
}

export default replayInWebview
