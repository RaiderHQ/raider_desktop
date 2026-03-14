/**
 * Safe logging utilities that catch EPIPE errors.
 * In Electron, console.log/error can throw EPIPE when the
 * renderer process disconnects before the main process finishes writing.
 */

export function safeLog(...args: unknown[]): void {
  try {
    console.log(...args)
  } catch {
    // Ignore EPIPE or other write errors
  }
}

export function safeError(...args: unknown[]): void {
  try {
    console.error(...args)
  } catch {
    // Ignore EPIPE or other write errors
  }
}

export function safeWarn(...args: unknown[]): void {
  try {
    console.warn(...args)
  } catch {
    // Ignore EPIPE or other write errors
  }
}
