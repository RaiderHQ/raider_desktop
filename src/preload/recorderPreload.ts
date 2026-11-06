import { ipcRenderer } from 'electron'

import {
  DEFAULT_PRIORITIES,
  DEFAULT_TEST_ID_ATTRIBUTE,
  getPrioritizedSelector as buildSelector,
  isRegion
} from './selectorStrategy'
import { fieldValue } from './secretField'
import { assertionFields } from './assertionFields'
import { installPickMode } from './pickMode'

// Events fired before the IPC call resolves use the defaults.
let selectorPriorities: string[] = DEFAULT_PRIORITIES
let testIdAttribute = DEFAULT_TEST_ID_ATTRIBUTE

ipcRenderer
  .invoke('get-selector-priority')
  .then((config: unknown) => {
    if (typeof config !== 'object' || config === null) return
    const { selectorPriority, testIdAttribute: attribute } = config as Record<string, unknown>
    if (Array.isArray(selectorPriority) && selectorPriority.length > 0) {
      selectorPriorities = selectorPriority.filter((p): p is string => typeof p === 'string')
    }
    if (typeof attribute === 'string' && attribute) testIdAttribute = attribute
  })
  .catch(() => {
    // keep defaults
  })

function getPrioritizedSelector(el: Element): ReturnType<typeof buildSelector> {
  return buildSelector(el, selectorPriorities, testIdAttribute)
}

// Fallbacks for naming an element when it has no visible text (e.g. inputs)
function labelHints(el: Element): { ariaLabel?: string; placeholder?: string } {
  return {
    ariaLabel: el.getAttribute('aria-label') ?? undefined,
    placeholder: el.getAttribute('placeholder') ?? undefined
  }
}

// Installed before the recorder's listeners; while picking, they never see the page's events
// A region of the page is not named by the text of the things inside it (D16)
const textOf = (el: Element): string =>
  isRegion(el) ? '' : ((el as HTMLElement).innerText || '').slice(0, 200)

const pickMode = installPickMode(window, ipcRenderer.send.bind(ipcRenderer), (el) => ({
  ...getPrioritizedSelector(el),
  innerText: textOf(el),
  ...labelHints(el),
  ...assertionFields(el)
}))
ipcRenderer.on('recorder-pick-mode', (_event, on: unknown) => pickMode.setPicking(on === true))

document.addEventListener(
  'click',
  (event) => {
    const target = event.target as HTMLElement
    if (target.tagName === 'HTML') return

    const { selector, strategy, locator } = getPrioritizedSelector(target)
    const rect = target.getBoundingClientRect()
    ipcRenderer.send('recorder-event', {
      action: 'click',
      selector,
      strategy,
      locator,
      tagName: target.tagName,
      pageUrl: window.location.href,
      innerText: textOf(target),
      ...labelHints(target),
      // A page region, so the step can say "an empty area" rather than "this element"
      region: isRegion(target),
      boundingRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    })
  },
  true
)

document.addEventListener(
  'change',
  (event) => {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
      const { selector, strategy, locator } = getPrioritizedSelector(target)
      const rect = target.getBoundingClientRect()
      ipcRenderer.send('recorder-event', {
        action: 'type',
        selector,
        strategy,
        locator,
        tagName: target.tagName,
        // A password's value never leaves the page; the step reads it from the environment
        ...fieldValue(target),
        pageUrl: window.location.href,
        innerText: (target.innerText || '').slice(0, 200),
        ...labelHints(target),
        boundingRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
      })
    }
  },
  true
)

document.addEventListener(
  'keydown',
  (event) => {
    const key = event.key
    const recordableKeys = [
      'Enter',
      'Tab',
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'Escape'
    ]

    if (recordableKeys.includes(key)) {
      const target = event.target as HTMLElement
      if (target) {
        const { selector, strategy, locator } = getPrioritizedSelector(target)
        const rect = target.getBoundingClientRect()
        ipcRenderer.send('recorder-event', {
          action: 'sendKeys',
          selector,
          strategy,
          locator,
          tagName: target.tagName,
          value: key,
          pageUrl: window.location.href,
          innerText: (target.innerText || '').slice(0, 200),
          ...labelHints(target),
          boundingRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
        })
      }
    }
  },
  true
)

document.addEventListener(
  'contextmenu',
  (event) => {
    event.preventDefault()
    const target = event.target as HTMLElement
    if (target) {
      const { selector, strategy, locator } = getPrioritizedSelector(target)
      const elementText = target.innerText || ''
      ipcRenderer.send('show-assertion-context-menu', {
        selector,
        strategy,
        locator,
        ...labelHints(target),
        elementText,
        ...assertionFields(target)
      })
    }
  },
  true
)
