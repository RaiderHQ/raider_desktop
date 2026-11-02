import type { Step } from './step'

/** Where one step's code sits in its spec file: 1-based, inclusive lines. */
export interface StepRange {
  stepId: string
  start: number
  end: number
}

export interface StepLines {
  /** sha256 of the file's exact bytes, so the line numbers are only trusted for that file */
  fileSha256: string
  ranges: StepRange[]
}

/** Raider's record of a recorded test, stored at `.raider/tests/<file>.json`. */
export interface Sidecar {
  version: 1
  id: string
  name: string
  url: string
  steps: Step[]
  /** Spec path relative to the project root, POSIX */
  file: string
  automation: 'selenium' | 'watir'
  /** hashRuby(generated file) */
  hash: string
  /** Absent for sidecars written before maps were stored */
  stepLines?: StepLines
  codeOwned?: true
  /** ISO */
  createdAt: string
  updatedAt: string
}

export type Ownership = 'recorded' | 'codeOwnedWasRecorded' | 'code'

export interface ProjectTestEntry {
  /** Relative POSIX path */
  file: string
  /** Sidecar name, else the first describe string, else the file name */
  name: string
  ownership: Ownership
  /** Present when a sidecar exists */
  testId?: string
  /** Sidecar exists but the file is gone */
  missingFile?: true
}

export interface CodeTestView {
  file: string
  examples: { name: string; steps: Step[] }[]
}
