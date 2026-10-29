// Mirrors `raider generate <type> <name> [--path]`; the gem accepts nothing more.
export const SCAFFOLD_GENERATE_TYPES = [
  'page',
  'feature',
  'spec',
  'helper',
  'steps',
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

export interface ScaffoldResult {
  success: boolean
  output: string
  error?: string
  files?: string[]
}
