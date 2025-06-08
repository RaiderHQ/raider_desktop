import { contextBridge, ipcRenderer } from 'electron';

/**
 * The 'recorderAPI' is exposed on the window object of the guest page (inside the webview).
 * It provides a secure way for the injected recorder script to send IPC messages
 * back to the host renderer process (your Recorder.tsx component).
 */
const recorderAPI = {
  /**
   * Sends a message to the host of the <webview>.
   * @param channel The channel name to send the message on.
   * @param args The data to send with the message.
   */
  sendToHost: (channel: string, ...args: any[]): void => {
    ipcRenderer.sendToHost(channel, ...args);
  },
};

contextBridge.exposeInMainWorld('recorderAPI', recorderAPI);

// It's good practice to also type the exposed API for use in your injected scripts,
// although this is more for development-time safety.
declare global {
  interface Window {
    recorderAPI: typeof recorderAPI;
  }
}
