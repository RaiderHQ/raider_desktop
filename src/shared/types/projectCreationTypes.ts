export type ReporterType = 'allure' | 'junit' | 'json' | 'both' | 'all' | 'none'

export interface ProjectCreationOptions {
  accessibility?: boolean
  reporter?: ReporterType
  skipCi?: boolean
  skipAllure?: boolean
  rubyVersion?: string
}
