/**
 * Standardized IPC response type used across all main process handlers.
 * Ensures consistent error handling between main and renderer processes.
 */
export type IpcResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }
