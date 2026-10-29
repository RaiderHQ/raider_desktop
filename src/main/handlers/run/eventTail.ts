import { promises as fs } from 'node:fs'
import path from 'node:path'

const WORKER_FILE = /^worker-(\d+)\.ndjson$/

interface FileState {
  offset: number
  /** Bytes after the last newline, held until the rest of the line arrives. */
  partial: Buffer
}

/**
 * Tails raider_reporter's per-worker `worker-<n>.ndjson` files in `dir`.
 * Each poll reads only the new bytes and emits every complete line.
 */
export class EventTail {
  private files = new Map<number, FileState>()
  private current: Promise<void> | null = null
  private queued: { promise: Promise<void>; resolve: () => void } | null = null

  constructor(
    private dir: string,
    private onLine: (worker: number, line: unknown) => void,
    private onBadLine: () => void
  ) {}

  /**
   * Passes never overlap. A call that arrives mid-pass gets one shared
   * follow-up pass, so it sees bytes written after the current pass started.
   */
  poll(): Promise<void> {
    if (!this.current) {
      this.current = this.loop()
      return this.current
    }
    if (!this.queued) {
      let resolve!: () => void
      const promise = new Promise<void>((r) => {
        resolve = r
      })
      this.queued = { promise, resolve }
    }
    return this.queued.promise
  }

  private async loop(): Promise<void> {
    let waiter: { resolve: () => void } | null = null
    try {
      for (;;) {
        try {
          await this.pollOnce()
        } finally {
          waiter?.resolve()
        }
        waiter = this.queued
        this.queued = null
        if (!waiter) return
      }
    } finally {
      // Also reached if pollOnce throws, so later polls never hang.
      this.current = null
      this.queued?.resolve()
      this.queued = null
    }
  }

  private async pollOnce(): Promise<void> {
    let names: string[]
    try {
      names = await fs.readdir(this.dir)
    } catch {
      return
    }
    const workers = names
      .map((name) => WORKER_FILE.exec(name))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => ({ name: m[0], worker: Number(m[1]) }))
      .sort((a, b) => a.worker - b.worker)
    for (const { name, worker } of workers) {
      await this.readFile(worker, path.join(this.dir, name))
    }
  }

  private async readFile(worker: number, file: string): Promise<void> {
    let state = this.files.get(worker)
    if (!state) {
      state = { offset: 0, partial: Buffer.alloc(0) }
      this.files.set(worker, state)
    }
    let chunk: Buffer
    try {
      const handle = await fs.open(file, 'r')
      try {
        const { size } = await handle.stat()
        if (size <= state.offset) return
        chunk = Buffer.alloc(size - state.offset)
        const { bytesRead } = await handle.read(chunk, 0, chunk.length, state.offset)
        chunk = chunk.subarray(0, bytesRead)
      } finally {
        await handle.close()
      }
    } catch {
      return
    }
    // Split on the newline byte before decoding so a multi-byte character cut by a read stays intact.
    let buf = Buffer.concat([state.partial, chunk])
    const texts: string[] = []
    let nl = buf.indexOf(0x0a)
    while (nl !== -1) {
      const text = buf.subarray(0, nl).toString('utf8').trim()
      buf = buf.subarray(nl + 1)
      if (text) texts.push(text)
      nl = buf.indexOf(0x0a)
    }
    // Advance state before emitting so a throwing callback can't replay or lose the chunk.
    state.offset += chunk.length
    state.partial = buf
    for (const text of texts) this.emit(worker, text)
  }

  private emit(worker: number, text: string): void {
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      this.safely(this.onBadLine)
      return
    }
    this.safely(() => this.onLine(worker, parsed))
  }

  /** A throwing callback must not cost the rest of the chunk. */
  private safely(fn: () => void): void {
    try {
      fn()
    } catch {
      // ignored
    }
  }
}
