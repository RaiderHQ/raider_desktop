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
