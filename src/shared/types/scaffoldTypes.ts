import type { ProjectFileErrorCode } from './projectFiles'

// Mirrors `raider generate <type> <name> [--path]`; the gem accepts nothing more.
export const SCAFFOLD_GENERATE_TYPES = [
  'page',
  'spec',
  'helper',
  'component',
  'scaffold'
] as const

export type ScaffoldComponentType = (typeof SCAFFOLD_GENERATE_TYPES)[number]

export type ScaffoldOperation = 'generate'

export interface ScaffoldParams {
  operation: ScaffoldOperation
  type?: ScaffoldComponentType
  name?: string
  path?: string
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
