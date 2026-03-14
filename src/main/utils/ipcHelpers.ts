import type { IpcResult } from '@shared/types/ipcResult'

/**
 * Create a successful IPC result.
 */
export function ipcSuccess<T>(data: T): IpcResult<T> {
  return { success: true, data }
}

/**
 * Create a failed IPC result.
 */
export function ipcError(error: string): IpcResult<never> {
  return { success: false, error }
}

/**
 * Wrap an async handler in standardized error handling.
 * Catches any thrown errors and returns them as IpcResult failures.
 */
export async function withIpcErrorHandling<T>(
  fn: () => Promise<IpcResult<T>>
): Promise<IpcResult<T>> {
  try {
    return await fn()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return ipcError(message)
  }
}
