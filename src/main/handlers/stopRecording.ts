import { IpcMainInvokeEvent } from 'electron'

/**
 * Handles the 'stop-recording-main' IPC call from the renderer process.
 * It logs the request and signals the renderer to stop the recording
 * by communicating with the script inside the webview.
 * @param event - The IPC event object.
 * @returns A promise that resolves with an object indicating success.
 */
const stopRecording = async (
  event: IpcMainInvokeEvent
): Promise<{ success: boolean }> => {
  console.log(`[MainProcess] Received 'stop-recording-main' request.`)

  // Signal the renderer to stop the recording script.
  event.sender.send('stop-recording-for-renderer')

  // Confirm to the renderer that the stop process has been initiated.
  return { success: true }
}

export default stopRecording
