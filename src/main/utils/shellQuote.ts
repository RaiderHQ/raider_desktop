const SAFE_TOKEN = /^[A-Za-z0-9_./:-]+$/

/**
 * Quotes one value for the shell so it reaches the command as a single argument.
 * POSIX: bare when safe, else single-quoted with `'\''` escaping.
 * win32 (cmd): double-quoted with embedded `"` doubled; never single quotes.
 */
export function quoteShellArg(value: string, platform: string = process.platform): string {
  if (SAFE_TOKEN.test(value)) return value
  if (platform === 'win32') return `"${value.replace(/"/g, '""')}"`
  return `'${value.replace(/'/g, `'\\''`)}'`
}
