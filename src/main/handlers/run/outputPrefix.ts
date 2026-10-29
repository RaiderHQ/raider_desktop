/** parallel_tests' --prefix-output-with-test-env-number prefix: "[TEST GROUP N] " (also accepts "[N] "); N is empty for worker 1. */
const PREFIX = /^\[(?:TEST GROUP )?(\d*)\] ?/

/**
 * Splits a chunk of parallel_tests output by worker prefix. Consecutive lines of
 * the same worker coalesce; newlines are kept; unprefixed text has worker undefined.
 */
export function parsePrefixedOutput(chunk: string): { worker: number | undefined; text: string }[] {
  const parts: { worker: number | undefined; text: string }[] = []
  for (const line of chunk.match(/[^\n]*\n|[^\n]+/g) ?? []) {
    const match = PREFIX.exec(line)
    const worker = match ? (match[1] === '' ? 1 : Number(match[1])) : undefined
    const text = match ? line.slice(match[0].length) : line
    const last = parts[parts.length - 1]
    if (last && last.worker === worker) last.text += text
    else parts.push({ worker, text })
  }
  return parts
}
