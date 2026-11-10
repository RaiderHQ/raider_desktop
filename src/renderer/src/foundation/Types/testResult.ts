export interface Attachment {
  name: string
  type: string
  source: string
}

export interface StatusDetails {
  message?: string
  trace?: string
}

export interface FailureInfo {
  message: string
  exceptionClass?: string
  backtrace: string[]
  appFrame?: string
}

export interface TraceRef {
  path: string
  attempt?: number
}

export type ComparisonStatus = 'passed' | 'failed' | 'created' | 'updated'

export interface ScreenshotComparison {
  name: string
  status: ComparisonStatus
  baseline: string | null // raw relative path from run.json
  diffPixels: number | null
  diffRatio: number | null
  threshold: number | null
  maxDiffPixels: number | null
  maxDiffRatio: number | null
  expectedSize: [number, number] | null
  actualSize: [number, number] | null
  images: { expected?: string; actual?: string; diff?: string } // absolute paths, resultsDir-joined
}

export interface TestResult {
  name: string
  status: string
  attachments?: Attachment[]
  screenshot?: string
  video?: string
  traces?: TraceRef[]
  comparisons?: ScreenshotComparison[]
  statusDetails?: StatusDetails
  failure?: FailureInfo
  durationMs?: number
  browser?: string
  identifier?: string
  file?: string
  line?: number
  /** Raw `run.finished_at` of the results file this row came from */
  finishedAt?: string
  /** Project-relative results folder of a flow run (`flow-results/<name>/<stamp>`); unset for raider-results */
  resultsDir?: string
}
