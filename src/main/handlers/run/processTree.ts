import { spawnSync } from 'node:child_process'

export interface ProcessEntry {
  pid: number
  ppid: number
  pgid: number
}

/** Parses `ps -A -o pid=,ppid=,pgid=` output; malformed lines are skipped. */
export function parsePs(output: string): ProcessEntry[] {
  const entries: ProcessEntry[] = []
  for (const line of output.split('\n')) {
    const fields = line.trim().split(/\s+/).map(Number)
    if (fields.length < 3 || !fields.slice(0, 3).every(Number.isInteger)) continue
    const [pid, ppid, pgid] = fields
    entries.push({ pid, ppid, pgid })
  }
  return entries
}

/** Every process below rootPid (breadth-first), not including the root. */
export function descendantsOf(rootPid: number, entries: ProcessEntry[]): ProcessEntry[] {
  const children = new Map<number, ProcessEntry[]>()
  for (const entry of entries) {
    const list = children.get(entry.ppid)
    if (list) list.push(entry)
    else children.set(entry.ppid, [entry])
  }
  const seen = new Set<number>([rootPid])
  const found: ProcessEntry[] = []
  const queue = [rootPid]
  while (queue.length > 0) {
    for (const child of children.get(queue.shift()!) ?? []) {
      if (seen.has(child.pid)) continue
      seen.add(child.pid)
      found.push(child)
      queue.push(child.pid)
    }
  }
  return found
}

type Ps = (
  cmd: string,
  args: string[],
  opts: { encoding: 'utf8' }
) => {
  stdout?: string | null
  status: number | null
  error?: Error
}

/**
 * The live processes below rootPid, POSIX only. Selenium starts chromedriver in its own
 * process group, so a group signal alone misses it and its browsers. [] if ps fails.
 */
export function descendantProcesses(
  rootPid: number,
  ps: Ps = spawnSync as unknown as Ps
): ProcessEntry[] {
  try {
    const result = ps('ps', ['-A', '-o', 'pid=,ppid=,pgid='], { encoding: 'utf8' })
    if (result.error || result.status !== 0 || !result.stdout) return []
    return descendantsOf(rootPid, parsePs(result.stdout))
  } catch {
    return []
  }
}

export const descendantPids = (rootPid: number, ps?: Ps): number[] =>
  descendantProcesses(rootPid, ps).map((p) => p.pid)

/**
 * What to SIGKILL some time after `recorded` was walked: the fresh descendants, plus any
 * recorded pid that is still alive with its parent inside the run's tree (the root, a
 * fresh descendant or another recorded pid), e.g. a browser whose chromedriver was
 * reparented. A recorded pid that now belongs to some other parent may have been reused,
 * so it is left alone.
 */
export function killTargets(
  rootPid: number,
  recorded: number[],
  entries: ProcessEntry[]
): number[] {
  const fresh = descendantsOf(rootPid, entries).map((p) => p.pid)
  const tree = new Set([rootPid, ...fresh, ...recorded])
  const targets = new Set(fresh)
  for (const entry of entries) {
    if (recorded.includes(entry.pid) && entry.pid !== rootPid && tree.has(entry.ppid))
      targets.add(entry.pid)
  }
  return [...targets]
}

/** killTargets from a fresh ps read; [] if ps fails. */
export function freshKillTargets(
  rootPid: number,
  recorded: number[],
  ps: Ps = spawnSync as unknown as Ps
): number[] {
  try {
    const result = ps('ps', ['-A', '-o', 'pid=,ppid=,pgid='], { encoding: 'utf8' })
    if (result.error || result.status !== 0 || !result.stdout) return []
    return killTargets(rootPid, recorded, parsePs(result.stdout))
  } catch {
    return []
  }
}

/** Sends signal to pid, ignoring a process that is already gone (or any other failure). */
export function signalPid(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(pid, signal)
  } catch {
    // ESRCH: already gone; EPERM: not ours to kill
  }
}
