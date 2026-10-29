/** Adds https:// to an address typed without a scheme (e.g. example.com or localhost:3000). */
export const withScheme = (raw: string): string => {
  const url = raw.trim()
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `https://${url}`
}

/**
 * The address the recorder opens, or null when it can't: the recorder's webview only
 * loads http and https websites (see windowGuards).
 */
export function toRecordableUrl(raw: string): string | null {
  if (raw.trim() === '') return null
  try {
    const url = new URL(withScheme(raw))
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}
