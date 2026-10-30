import os from 'os'
import type { RunDefaults } from '@shared/types/runEvents'

/** Recommended workers are clamp(floor(cpus / 2), 1, 4); the maximum is the cpu count. */
export function runDefaults(cpus: number = os.cpus().length): RunDefaults {
  const max = Math.max(1, cpus)
  return { recommendedWorkers: Math.min(4, Math.max(1, Math.floor(max / 2))), maxWorkers: max }
}

/** Clamps a requested worker count to [1, max]; undefined means serial. */
export function clampWorkers(requested: number | undefined, max: number): number {
  if (requested === undefined || !Number.isFinite(requested)) return 1
  return Math.min(Math.max(1, Math.floor(requested)), Math.max(1, max))
}
