import path from 'path'
import { app } from 'electron'

/**
 * Validates that a file path is within allowed directories.
 * Prevents path traversal attacks from the renderer process.
 *
 * Allowed directories:
 * - User's home directory and its subdirectories
 * - System temp directory (for trace screenshots)
 * - Electron's userData directory
 */
export function validateFilePath(filePath: string): { valid: boolean; resolved: string } {
  if (!filePath || typeof filePath !== 'string') {
    return { valid: false, resolved: '' }
  }

  const resolved = path.resolve(filePath)

  const homeDir = process.env.HOME || process.env.USERPROFILE || ''
  const tmpDir = require('os').tmpdir()

  let userDataDir: string
  try {
    userDataDir = app.getPath('userData')
  } catch {
    // app may not be ready in tests
    userDataDir = ''
  }

  const allowedBases = [homeDir, tmpDir, userDataDir].filter(Boolean)

  const isAllowed = allowedBases.some((base) => resolved.startsWith(base + path.sep) || resolved === base)

  return { valid: isAllowed, resolved }
}
