import { createHash } from 'crypto'

/**
 * Normalise Ruby spec source so that whitespace, line-ending and full-line
 * comment changes do not count as edits. Only lines whose first non-space
 * character is `#` are dropped; `#` inside code (e.g. `'#submit'`) is kept.
 */
export function normalizeRuby(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .join('\n')
}

export function hashRuby(text: string): string {
  return createHash('sha256').update(normalizeRuby(text)).digest('hex')
}
