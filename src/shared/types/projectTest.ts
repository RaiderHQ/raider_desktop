import type { Step } from './step'

/** Where one step's code sits in its spec file: 1-based, inclusive lines. */
export interface StepRange {
  stepId: string
  start: number
  end: number
  /** English description of the step, snapshotted when the map was written; absent in older sidecars */
  title?: string
}

export interface StepLines {
  /** sha256 of the file's exact bytes, so the line numbers are only trusted for that file */
  fileSha256: string
  ranges: StepRange[]
}

/** A flow input: its name (INPUT_NAME) and the value typed when none is given. */
export interface FlowInput {
  name: string
  default: string
}

export type RecordingKind = 'test' | 'flow'

/** Raider's record of a recorded test, stored at `.raider/tests/<file>.json`. */
export interface Sidecar {
  version: 1
  id: string
  name: string
  url: string
  steps: Step[]
  /** Spec path relative to the project root, POSIX */
  file: string
  /** hashRuby(generated file) */
  hash: string
  /** The codegen shape the file was written in (CODEGEN_VERSION); absent before 4.0 */
  codegen?: number
  /** Absent for sidecars written before maps were stored */
  stepLines?: StepLines
  codeOwned?: true
  /** Normalized: lower-case, sorted, unique (see shared/tags) */
  tags?: string[]
  /** Absent means a test */
  kind?: RecordingKind
  /** A flow's inputs, unique by name */
  inputs?: FlowInput[]
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
  /** Sorted tags: the sidecar's for a recorded test, else the first describe line's */
  tags: string[]
  /** Sidecar exists but the file is gone */
  missingFile?: true
  /** A flow (`flows/<name>_flow.rb`); absent for a test */
  kind?: 'flow'
}

export interface CodeTestView {
  file: string
  examples: { name: string; steps: Step[] }[]
}

/** One flow of the project (`list-project-flows`) */
export interface ProjectFlowEntry {
  /** Record name, else the first describe string, else the file name */
  name: string
  /** `flows/<stem>_flow.rb` */
  file: string
  /** The flow's name for `raider flow <stem>` */
  stem: string
  ownership: Ownership
  /** Present when Raider recorded it */
  testId?: string
  /** The recorded flow's inputs; [] for a flow Raider didn't record or doesn't own */
  inputs: FlowInput[]
  missingFile?: true
}

/** 'convert-to-flow' */
export type ConvertToFlowResult =
  | { success: true; test: import('./test').Test }
  | { success: false; error: 'has-checks'; stepIds: string[] }
  | { success: false; error: string }
