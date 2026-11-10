/** What the results table knows about one failed row, to find its recorded step. */
export interface FailedStepQuery {
  file: string
  backtrace: string[]
  appFrame?: string
  /** The run's raw `finished_at` */
  finishedAt?: string
}

export type NoStepReason = 'notRecorded' | 'edited' | 'changedSinceRun' | 'outsideSteps' | 'noMap'

export type FailedStepMap = { stepId: string; index: number } | { none: NoStepReason }
