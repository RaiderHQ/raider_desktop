import type { Step } from './step'
import type { TraceStep } from './traceStep'
import type { FlowInput, Ownership, RecordingKind } from './projectTest'

export interface Test {
  id: string
  name: string
  url: string
  steps: Step[]
  trace?: TraceStep[]
  hasTrace?: boolean
  /** Set for tests assembled from project files: who may edit the spec */
  ownership?: Ownership
  /** Spec path relative to the project root, POSIX (project-file tests only) */
  file?: string
  /** Tags written as RSpec metadata on the describe line (recorded project tests) */
  tags?: string[]
  /** Absent means a test */
  kind?: RecordingKind
  /** A flow's inputs */
  inputs?: FlowInput[]
}
