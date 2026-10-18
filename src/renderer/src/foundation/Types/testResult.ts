export interface Attachment {
  name: string
  type: string
  source: string
}

export interface StatusDetails {
  message?: string
  trace?: string
}

export interface TestResult {
  name: string
  status: string
  attachments?: Attachment[]
  screenshot?: string
  statusDetails?: StatusDetails
}
