type Segment = { worker: number | undefined; text: string }

const PREFIX = /\[TEST GROUP (\d*)\] /g
const PREFIX_START = '[TEST GROUP '
/** A trailing fragment that may still become a prefix once the next chunk arrives. */
const PARTIAL = /^\[TEST GROUP \d*\]?$/

/**
 * Splits raw parallel_tests output (--prefix-output-with-test-env-number) by worker.
 * parallel_tests prints "[TEST GROUP N] " once per raw read (N empty = worker 1), so a
 * prefix can appear mid-line, a read can hold many lines, and a Node chunk can split a prefix.
 * Text without a prefix inherits the most recent worker. Attribution of raw output is
 * best-effort; the structured events carry the real worker.
 */
export class OutputPrefixParser {
  private worker: number | undefined
  private held = ''

  push(chunk: string): Segment[] {
    const text = this.held + chunk
    this.held = ''
    const segments: Segment[] = []
    let pos = 0
    for (const match of text.matchAll(PREFIX)) {
      this.add(segments, text.slice(pos, match.index))
      this.worker = match[1] === '' ? 1 : Number(match[1])
      pos = match.index + match[0].length
    }
    let rest = text.slice(pos)
    const open = rest.lastIndexOf('[')
    if (open !== -1) {
      const tail = rest.slice(open)
      if (PREFIX_START.startsWith(tail) || PARTIAL.test(tail)) {
        this.held = tail
        rest = rest.slice(0, open)
      }
    }
    this.add(segments, rest)
    return segments
  }

  /** Releases a held fragment that never became a prefix; call at the end of the run. */
  flush(): Segment[] {
    const segments: Segment[] = []
    this.add(segments, this.held)
    this.held = ''
    return segments
  }

  private add(segments: Segment[], text: string): void {
    if (text === '') return
    const last = segments[segments.length - 1]
    if (last && last.worker === this.worker) last.text += text
    else segments.push({ worker: this.worker, text })
  }
}
