import { ipcRenderer } from 'electron';

// Function to generate a basic CSS selector for an element
function getCssSelector(el: HTMLElement): string {
  if (!el || !(el instanceof HTMLElement)) {
    return '';
  }

  const parts: string[] = [];
  let currentEl: HTMLElement | null = el;

  while (currentEl && currentEl.nodeType === Node.ELEMENT_NODE) {
    let part = currentEl.nodeName.toLowerCase();
    if (currentEl.id) {
      part += '#' + currentEl.id;
      parts.unshift(part);
      break; // ID should be unique
    } else {
      let sibling = currentEl;
      let nth = 1;
      while ((sibling = sibling.previousElementSibling as HTMLElement | null)) {
        if (sibling.nodeName.toLowerCase() === part) {
          nth++;
        }
      }
      if (nth > 1) {
        part += `:nth-of-type(${nth})`;
      }
    }
    parts.unshift(part);
    currentEl = currentEl.parentElement;
  }
  return parts.join(' > ');
}

// Listen for DOMContentLoaded to ensure the document is ready
window.addEventListener('DOMContentLoaded', () => {
  document.body.addEventListener('click', (event) => {
    try {
      const target = event.target as HTMLElement;
      if (target) {
        const selector = getCssSelector(target);
        // Send the selector and target tag name to the host renderer process
        ipcRenderer.sendToHost('webview-click', {
          selector: selector,
          tagName: target.tagName.toLowerCase()
        });
      }
    } catch (error) {
      // In case of any error during click processing within the webview
      ipcRenderer.sendToHost('webview-error', {
        message: 'Error capturing click in webview',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }, true); // Use capture phase to get the click before it might be stopped by other listeners
});

console.log('Recorder preload script loaded.');
