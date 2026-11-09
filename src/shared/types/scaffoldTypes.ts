import type { ProjectFileErrorCode } from './projectFiles'
import type { FolderScaffoldType } from '../scaffoldName'

export type ScaffoldOperation = 'generate'

/** `raider g <type> <name> --path=<path>` from the Files folder menu; path is project-relative. */
export interface ScaffoldParams {
  operation: ScaffoldOperation
  type: FolderScaffoldType
  name: string
  path: string
}

/**
 * What `scaffold-generate` answers. With a folder (`path`), `files` holds the new file's
 * project-relative path and `code` says why it was refused, as the Files operations do.
 */
export interface ScaffoldResult {
  success: boolean
  output: string
  error?: string
  code?: ProjectFileErrorCode
  files?: string[]
}
