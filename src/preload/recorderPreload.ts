import { ipcRenderer } from 'electron'

/**
 * Generates the best possible selector for an element using a prioritized strategy.
 * Priority: Unique ID -> CSS Path -> Absolute XPath.
 * @param el The element to generate a selector for.
 * @returns A single, high-priority selector string.
 */
function getPrioritizedSelector(el: Element): string {
  // 1. Priority: Unique ID
  // A unique ID is the most reliable locator. We'll format it as a CSS selector.
  if (el.id) {
    // Verify the ID is unique to avoid ambiguity.
    if (document.querySelectorAll(`#${el.id}`).length === 1) {
      return `#${el.id}`
    }
  }

  // 2. Priority: CSS Path (if no unique ID is found)
  // This generates a specific path from the parent to the child element.
  if (el instanceof HTMLElement) {
    const parts: string[] = []
    let currentEl: Element | null = el
    while (currentEl && currentEl.nodeType === Node.ELEMENT_NODE) {
      let part = currentEl.nodeName.toLowerCase()
      if (currentEl.id) {
        part += `#${currentEl.id}`
        parts.unshift(part)
        break // Stop if we hit an element with an ID
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
    if (parts.length) {
      return parts.join(' > ')
    }
  }

  // 3. Fallback: Absolute XPath
  // This is the least preferred method as it's brittle, but it's a reliable last resort.
  let xpath = ''
  let currentEl: Element | null = el
  while (currentEl && currentEl.nodeType === Node.ELEMENT_NODE) {
    let index = 1
    let sibling = currentEl.previousElementSibling
    while (sibling) {
      if (sibling.nodeName === currentEl.nodeName) {
        index++
      }
      sibling = sibling.previousElementSibling
    }
    xpath = `/${currentEl.nodeName.toLowerCase()}[${index}]` + xpath
    currentEl = currentEl.parentElement
  }
  return xpath
}

// --- Event Listeners ---

// 1. Listen for all clicks on the document
document.addEventListener(
  'click',
  (event) => {
    const target = event.target as HTMLElement
    if (target.tagName === 'HTML') return

    ipcRenderer.send('recorder-event', {
      action: 'click',
      selector: getPrioritizedSelector(target),
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
        selector: getPrioritizedSelector(target),
        tagName: target.tagName,
        value: target.value
      })
    }
  },
  true
)

// 3. Listen for specific keydown events
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
          selector: getPrioritizedSelector(target),
          tagName: target.tagName,
          value: key
        })
      }
    }
  },
  true
)

// 4. Listen for the context menu event (right-click) for assertions
document.addEventListener(
  'contextmenu',
  (event) => {
    event.preventDefault() // Prevent the default browser context menu
    const target = event.target as HTMLElement
    if (target) {
      const selector = getPrioritizedSelector(target)
      const elementText = target.innerText || ''
      ipcRenderer.send('show-assertion-context-menu', { selector, elementText })
    }
  },
  true
)
