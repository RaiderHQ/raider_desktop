import { ipcRenderer } from 'electron'

/**
 * Generates the best possible selector for an element using a prioritized strategy.
 * Priority: Unique ID -> CSS Path -> Absolute XPath.
 * @param el The element to generate a selector for.
 * @returns A single, high-priority selector string.
 */
function getPrioritizedSelector(el: Element): string {
  if (el.id) {
    if (document.querySelectorAll(`#${el.id}`).length === 1) {
      return `#${el.id}`
    }
  }

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

document.addEventListener(
  'contextmenu',
  (event) => {
    event.preventDefault()
    const target = event.target as HTMLElement
    if (target) {
      const selector = getPrioritizedSelector(target)
      const elementText = target.innerText || ''
      ipcRenderer.send('show-assertion-context-menu', { selector, elementText })
    }
  },
  true
)
