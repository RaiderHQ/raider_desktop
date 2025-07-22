import { ipcRenderer } from 'electron'

/**
 * Generates a unique CSS selector for a given HTML element.
 * @param el The element to generate a selector for.
 * @returns A CSS selector string.
 */
function getCssSelector(el: Element): string {
  if (!el || !(el instanceof Element)) return ''
  const parts: string[] = []
  let currentEl: Element | null = el
  while (currentEl && currentEl.nodeType === Node.ELEMENT_NODE) {
    let part = currentEl.nodeName.toLowerCase()
    if (currentEl.id) {
      part += `#${currentEl.id}`
      parts.unshift(part)
      break
    } else {
      let sibling = currentEl
      let nth = 1
      while ((sibling = sibling.previousElementSibling!)) {
        if (sibling.nodeName.toLowerCase() === part) nth++
      }
      if (nth > 1) part += `:nth-of-type(${nth})`
    }
    parts.unshift(part)
    currentEl = currentEl.parentElement
  }
  return parts.join(' > ')
}

// --- Event Listeners ---

// 1. Listen for all clicks on the document
document.addEventListener(
  'click',
  (event) => {
    const target = event.target as HTMLElement
    if (target.tagName === 'HTML') return // Basic filter for scrollbar clicks

    ipcRenderer.send('recorder-event', {
      action: 'click',
      selector: getCssSelector(target),
      tagName: target.tagName
    })
  },
  true
)

// 2. Listen for when an input, textarea, or select value changes
document.addEventListener(
  'change',
  (event) => {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
      ipcRenderer.send('recorder-event', {
        action: 'type',
        selector: getCssSelector(target),
        tagName: target.tagName,
        value: target.value
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
        ipcRenderer.send('recorder-event', {
          action: 'sendKeys',
          selector: getCssSelector(target),
          tagName: target.tagName,
          value: key
        })
      }
    }
  },
  true
)

console.log('[Recorder Preload] Script loaded. Listening for clicks, changes, and keydown events.')
