import { IpcMainInvokeEvent } from 'electron'

/**
 * Handles the 'start-recording-main' IPC call from the renderer process.
 * It logs the request and signals the renderer to inject the recorder script
 * into the webview, effectively starting the recording session.
 * @param event - The IPC event object.
 * @returns A promise that resolves with an object indicating success.
 */
const startRecording = async (
  event: IpcMainInvokeEvent
): Promise<{ success: boolean }> => {
  console.log(`[MainProcess] Received 'start-recording-main' request.`);

  // Signal the renderer to inject the recorder script.
  event.sender.send('inject-recorder-script');

  // Confirm to the renderer that the start process has been initiated.
  return { success: true }
};

export default  startRecording;
