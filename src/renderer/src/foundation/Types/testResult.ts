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

export interface TestResult {
  name: string
  status: string
  attachments?: Attachment[]
  screenshot?: string
  video?: string
  statusDetails?: StatusDetails
  failure?: FailureInfo
  durationMs?: number
  browser?: string
}
