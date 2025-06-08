import { IpcMainInvokeEvent } from 'electron';

/**
 * Handles the 'load-url-request' IPC call from the renderer process.
 * It receives a URL, logs it, and then instructs the renderer process
 * that sent the request to load this URL into its webview.
 * @param event - The IPC event object.
 * @param url - The URL string to load.
 * @returns A promise that resolves with an object indicating success.
 */
const LoadUrlRequest = async (
  event: IpcMainInvokeEvent,
  url: string
): Promise<{ success: boolean; message: string }> => {
  console.log(`[MainProcess] Received 'load-url-request' for: ${url}`);

  // Instruct the renderer window to send the URL to its webview component.
  event.sender.send('load-url-in-webview', url);

  // ipcMain.handle requires a returned promise. This confirms the operation was received.
  return { success: true, message: `URL load initiated for ${url}` };
};

export default LoadUrlRequest;
