import type { Step } from './step'

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
