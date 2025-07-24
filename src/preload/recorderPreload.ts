import { ipcRenderer } from 'electron'

let selectorPriorities: string[] = ['id', 'css', 'xpath'];

ipcRenderer.invoke('get-selector-priorities').then(priorities => {
  selectorPriorities = priorities;
});

ipcRenderer.on('update-selector-priorities', (_event, priorities: string[]) => {
  selectorPriorities = priorities;
});

function getCssPath(el: Element): string {
    if (!(el instanceof Element)) return '';
    const path = [];
    while (el.nodeType === Node.ELEMENT_NODE) {
        let selector = el.nodeName.toLowerCase();
        if (el.id) {
            selector += '#' + el.id;
            path.unshift(selector);
            break;
        } else {
            let sib = el, nth = 1;
            while (sib = sib.previousElementSibling!) {
                if (sib.nodeName.toLowerCase() == selector)
                    nth++;
            }
            if (nth != 1)
                selector += ":nth-of-type("+nth+")";
        }
        path.unshift(selector);
        el = el.parentNode as Element;
    }
    return path.join(" > ");
}

function getXPath(element: Element): string {
    if (element.id !== '') {
        return `id("${element.id}")`
    }
    if (element === document.body) {
        return element.tagName.toLowerCase()
    }

    let ix = 0
    const siblings = element.parentNode?.children || new HTMLCollection()

    for (let i = 0; i < siblings.length; i++) {
        const sibling = siblings[i]
        if (sibling === element) {
            return (
                getXPath(element.parentElement as Element) +
                '/' +
                element.tagName.toLowerCase() +
                '[' +
                (ix + 1) +
                ']'
            )
        }
        if (sibling.nodeType === 1 && sibling.tagName === element.tagName) {
            ix++
        }
    }
    return ''
}


function getPrioritizedSelector(el: Element): string {
  for (const priority of selectorPriorities) {
    if (priority === 'id' && el.id) {
      if (document.querySelectorAll(`#${el.id}`).length === 1) {
        return `#${el.id}`;
      }
    } else if (priority === 'css') {
        const selector = getCssPath(el);
        if(selector && document.querySelectorAll(selector).length === 1) {
            return selector;
        }
    } else if (priority === 'xpath') {
        const selector = getXPath(el);
        if (selector) return selector;
    } else {
      // Handle custom attributes
      const customSelector = el.getAttribute(priority);
      if (customSelector) {
        const selector = `[${priority}="${customSelector}"]`;
        if (document.querySelectorAll(selector).length === 1) {
          return selector;
        }
      }
    }
  }
  // Fallback to a robust selector if no priority matches
  return getCssPath(el) || getXPath(el);
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