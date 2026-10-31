import type { RunDefaults, RunScope } from '@shared/types/runEvents'

export interface RunSettings {
  parallel: boolean
  workers: number | null
  quarantinedFails: boolean
}

const DEFAULTS: RunSettings = { parallel: false, workers: null, quarantinedFails: false }

const keyFor = (projectPath: string): string => `runSettings:${projectPath}`

export function loadRunSettings(projectPath: string): RunSettings {
  try {
    const raw = localStorage.getItem(keyFor(projectPath))
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<RunSettings>
    return {
      parallel: parsed.parallel === true,
      workers: typeof parsed.workers === 'number' ? parsed.workers : null,
      quarantinedFails: parsed.quarantinedFails === true
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveRunSettings(projectPath: string, s: RunSettings): void {
  try {
    localStorage.setItem(keyFor(projectPath), JSON.stringify(s))
  } catch (error) {
    console.error('Saving run settings failed:', error)
  }
}

/** Undefined runs serially: not parallel, a single location, or at most one file. */
export function workersFor(s: RunSettings, d: RunDefaults, scope: RunScope): number | undefined {
  if (!s.parallel || scope.kind === 'locations') return undefined
  if (scope.kind === 'files' && scope.files.length <= 1) return undefined
  const wanted = s.workers ?? d.recommendedWorkers
  return Math.min(Math.max(wanted, 1), d.maxWorkers)
}
