export type ScaffoldComponentType = 'page' | 'spec' | 'feature' | 'steps' | 'helper' | 'component'

export type ScaffoldOperation = 'generate' | 'smart' | 'from_url' | 'dry_run' | 'delete' | 'destroy'

export interface ScaffoldParams {
  operation: ScaffoldOperation
  type?: ScaffoldComponentType
  names?: string[]
  name?: string
  url?: string
  path?: string
  components?: string[]
  uses?: string[]
  crud?: boolean
  from?: string
  ai?: boolean
}

export interface ScaffoldResult {
  success: boolean
  output: string
  error?: string
  files?: string[]
}
