import { ipcRenderer } from 'electron';

let isRecordingActive = false;

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
    if (isRecordingActive) {
      try {
        const target = event.target as HTMLElement;
        if (target) {
          const selector = getCssSelector(target); // Assuming getCssSelector is defined in this file
          ipcRenderer.sendToHost('webview-click', {
            selector: selector,
            tagName: target.tagName.toLowerCase()
          });
        }
      } catch (error) {
        ipcRenderer.sendToHost('webview-error', {
          message: 'Error capturing click in webview',
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }, true); // Use capture phase to get the click before it might be stopped by other listeners
});

console.log('Recorder preload script loaded.');

ipcRenderer.on('start-recording-in-webview', () => {
  console.log('[recorderPreload] Received start-recording-in-webview');
  isRecordingActive = true;
  // Optionally send a confirmation back if needed:
  // ipcRenderer.sendToHost('webview-recording-started');
});

ipcRenderer.on('stop-recording-in-webview', () => {
  console.log('[recorderPreload] Received stop-recording-in-webview');
  isRecordingActive = false;
  // Optionally send a confirmation back if needed:
  // ipcRenderer.sendToHost('webview-recording-stopped');
});
