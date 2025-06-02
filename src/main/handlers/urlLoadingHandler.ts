import { IpcMainInvokeEvent } from 'electron';

/**
 * Handles the 'load-url-request' IPC call from the renderer process.
 * It receives a URL, logs it, and then instructs the calling renderer 
 * process to load this URL into its webview.
 */
export const handleLoadUrlRequest = async (event: IpcMainInvokeEvent, url: string): Promise<void> => {
  console.log(`[MainProcess] Received load-url-request for: ${url}`);
  
  // Basic validation or sanitization of the URL could be done here if needed.
  // For now, just pass it along.

  event.sender.send('load-url-in-webview', url);
  
  // ipcMain.handle expects a Promise. If the handler is async, it implicitly returns one.
  // If it were synchronous and needed to return a value, it would be `return value;`
  // If synchronous and no value, it could be just `return;` or `return Promise.resolve();`
  // Since this is async void, it's fine.
};
