import { ipcRenderer } from 'electron';

/**
 * Generates a unique CSS selector for a given HTML element.
 * @param el The element to generate a selector for.
 * @returns A CSS selector string.
 */
function getCssSelector(el: Element): string {
  if (!el || !(el instanceof Element)) return '';
  const parts: string[] = [];
  let currentEl: Element | null = el;
  while (currentEl && currentEl.nodeType === Node.ELEMENT_NODE) {
    let part = currentEl.nodeName.toLowerCase();
    if (currentEl.id) {
      part += `#${currentEl.id}`;
      parts.unshift(part);
      break;
    } else {
      let sibling = currentEl;
      let nth = 1;
      while ((sibling = sibling.previousElementSibling!)) {
        if (sibling.nodeName.toLowerCase() === part) nth++;
      }
      if (nth > 1) part += `:nth-of-type(${nth})`;
    }
    parts.unshift(part);
    currentEl = currentEl.parentElement;
  }
  return parts.join(' > ');
}

// --- Event Listeners ---

// Listen for all clicks on the document
document.addEventListener('click', (event) => {
  // We send the raw event data back to the main process for handling
  const target = event.target as HTMLElement;
  if (target) {
    ipcRenderer.send('recorder-event', {
      action: 'click',
      selector: getCssSelector(target),
      tagName: target.tagName,
      value: (target as HTMLInputElement).value, // Include other potential data
    });
  }
}, true); // Use the capturing phase to get the event early

console.log('[Recorder Preload] Script loaded. Listening for user actions.');
