import fs from 'fs'
import { IpcMainInvokeEvent } from 'electron'
import { safeExec } from '../../utils/safeExec'
import { buildShellCommand } from '../../utils/shellCommand'
import type { ScaffoldParams } from '@shared/types/scaffoldTypes'
import { SCAFFOLD_GENERATE_TYPES as GENERATE_TYPES } from '@shared/types/scaffoldTypes'
import { CommandType } from '@foundation/Types/commandType'

function buildCommand(params: ScaffoldParams): string {
  if (params.operation !== 'generate' || !params.type || !params.name) {
    throw new Error('type and name are required')
  }
  if (!GENERATE_TYPES.includes(params.type)) {
    throw new Error(`Unsupported type: ${params.type}`)
  }
  const args = ['raider', 'g', params.type, params.name]
  if (params.path) args.push('--path', params.path)
  return args.join(' ')
}

const handler = async (
  _event: IpcMainInvokeEvent,
  params: ScaffoldParams,
  projectPath: string,
  _rubyCommand: string
): Promise<CommandType> => {
  const fixPath = (await import('fix-path')).default
  fixPath()

  try {
    // Validate project path exists
    if (!fs.existsSync(projectPath)) {
      return { success: false, output: '', error: `Project path does not exist: ${projectPath}` }
    }

    const command = buildCommand(params)
    const shellCommand = buildShellCommand(projectPath, command)

    const result = await safeExec(shellCommand, { timeout: 30_000 })

    if (result.exitCode !== 0) {
      return {
        success: false,
        output: result.stderr.trim() || result.stdout.trim(),
        error: result.stderr.trim()
      }
    }
    return { success: true, output: result.stdout.trim() }
  } catch (error) {
    return {
      success: false,
      output: '',
      error: (error as Error).message
    }
  }
}

export default handler
