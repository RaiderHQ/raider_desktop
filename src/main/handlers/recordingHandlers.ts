import { IpcMainInvokeEvent } from 'electron';

/**
 * Handles the 'start-recording-main' IPC call from the renderer process.
 * Signals the calling renderer process to prepare its webview for recording.
 */
export const handleStartRecordingMain = async (event: IpcMainInvokeEvent): Promise<void> => {
  console.log('[MainProcess] Received start-recording-main request.');
  // Add any main process specific logic here if needed (e.g., state tracking)
  
  // Notify the calling renderer to proceed with starting recording in its webview
  event.sender.send('start-recording-for-renderer');
  
  // Potentially return a status or data if defined in the ipcMain.handle contract
  // For now, it's void.
};

/**
 * Handles the 'stop-recording-main' IPC call from the renderer process.
 * Signals the calling renderer process to stop recording in its webview.
 */
export const handleStopRecordingMain = async (event: IpcMainInvokeEvent): Promise<void> => {
  console.log('[MainProcess] Received stop-recording-main request.');
  // Add any main process specific logic here if needed
  
  // Notify the calling renderer to proceed with stopping recording in its webview
  event.sender.send('stop-recording-for-renderer');
  
  // Potentially return a status or data
};
