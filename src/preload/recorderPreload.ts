import { ipcRenderer } from 'electron'

import { DEFAULT_PRIORITIES, getPrioritizedSelector as buildSelector } from './selectorStrategy'

// Events fired before the IPC call resolves use the default list.
let selectorPriorities: string[] = DEFAULT_PRIORITIES

ipcRenderer
  .invoke('get-selector-priority')
  .then((priorities: unknown) => {
    if (Array.isArray(priorities) && priorities.length > 0) {
      selectorPriorities = priorities.filter((p): p is string => typeof p === 'string')
    }
  })
  .catch(() => {
    // keep defaults
  })

function getPrioritizedSelector(el: Element): ReturnType<typeof buildSelector> {
  return buildSelector(el, selectorPriorities)
}

// Fallbacks for naming an element when it has no visible text (e.g. inputs)
function labelHints(el: Element): { ariaLabel?: string; placeholder?: string } {
  return {
    ariaLabel: el.getAttribute('aria-label') ?? undefined,
    placeholder: el.getAttribute('placeholder') ?? undefined
  }
}

document.addEventListener(
  'click',
  (event) => {
    const target = event.target as HTMLElement
    if (target.tagName === 'HTML') return

    const { selector, strategy } = getPrioritizedSelector(target)
    const rect = target.getBoundingClientRect()
    ipcRenderer.send('recorder-event', {
      action: 'click',
      selector,
      strategy,
      tagName: target.tagName,
      pageUrl: window.location.href,
      innerText: (target.innerText || '').slice(0, 200),
      ...labelHints(target),
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
      const { selector, strategy } = getPrioritizedSelector(target)
      const rect = target.getBoundingClientRect()
      ipcRenderer.send('recorder-event', {
        action: 'type',
        selector,
        strategy,
        tagName: target.tagName,
        value: target.value,
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
        const { selector, strategy } = getPrioritizedSelector(target)
        const rect = target.getBoundingClientRect()
        ipcRenderer.send('recorder-event', {
          action: 'sendKeys',
          selector,
          strategy,
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
      const { selector, strategy } = getPrioritizedSelector(target)
      const elementText = target.innerText || ''
      const elementValue = (target as HTMLInputElement).value ?? ''
      const inputType =
        target.tagName === 'INPUT' ? (target as HTMLInputElement).type.toLowerCase() : ''
      const pageTitle = document.title
      const pageUrl = window.location.href
      ipcRenderer.send('show-assertion-context-menu', {
        selector,
        strategy,
        ...labelHints(target),
        elementText,
        elementValue,
        inputType,
        pageTitle,
        pageUrl
      })
    }
  },
  true
)
