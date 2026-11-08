/**
 * The one rule for file and folder names made or reached from the Files tab, shared by the
 * main-side handlers and the name dialog. Names must work on macOS, Linux and Windows, so a
 * project created on one still opens on the others.
 */
export type EntryNameIssue =
  | 'empty'
  | 'invalid'
  | 'characters'
  | 'trailing'
  | 'reserved'
  | 'protected'

// Device names Windows reserves, with or without an extension (CON, con.txt, LPT1.rb…)
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i
// Git's and Raider's own folders are never created, renamed, copied or trashed from Files
const PROTECTED = ['.git', '.raider']

/** Git's or Raider's own folder name, in any case. */
export const isProtectedName = (name: string): boolean => PROTECTED.includes(name.toLowerCase())

/**
 * The looser rule for a segment of a path that already exists: only what can't name an
 * entry at all, or Git's and Raider's folders. Odd names made elsewhere (`bar.`, `aux.rb`)
 * stay reachable, so they can be renamed to something better or trashed.
 */
export const isReachableSegment = (segment: string): boolean =>
  segment !== '' &&
  segment !== '.' &&
  segment !== '..' &&
  !/[/\\\0]/.test(segment) &&
  !isProtectedName(segment)

/** What is wrong with `name` as a new path segment, or null when it is fine. */
export function entryNameIssue(name: unknown): EntryNameIssue | null {
  if (typeof name !== 'string' || name.trim() === '') return 'empty'
  const trimmed = name.trim()
  if (trimmed === '.' || trimmed === '..' || /[/\\]/.test(name)) return 'invalid'
  // eslint-disable-next-line no-control-regex
  if (/[<>:"|?*\x00-\x1f\x7f]/.test(name)) return 'characters'
  if (/[. ]$/.test(name)) return 'trailing'
  if (WINDOWS_RESERVED.test(name)) return 'reserved'
  if (isProtectedName(name)) return 'protected'
  return null
}
