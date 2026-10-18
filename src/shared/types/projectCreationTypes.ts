export type ReporterType = 'junit' | 'json' | 'both' | 'all' | 'none'

export interface ProjectCreationOptions {
  accessibility?: boolean
  reporter?: ReporterType
  skipCi?: boolean
  rubyVersion?: string
  ci?: 'github' | 'azure'
}
