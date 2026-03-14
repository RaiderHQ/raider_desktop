import fs from 'fs'
import path from 'path'
import { IpcMainInvokeEvent } from 'electron'
import { safeExec } from '../../utils/safeExec'
import { buildShellCommand } from '../../utils/shellCommand'
import { CommandType } from '@foundation/Types/commandType'

interface ScaffoldParams {
  operation: 'generate' | 'smart' | 'from_url' | 'dry_run' | 'delete' | 'destroy'
  type?: string
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

function buildCommand(params: ScaffoldParams): string {
  const args: string[] = ['raider', 'g']

  switch (params.operation) {
    case 'generate':
    case 'delete':
    case 'dry_run': {
      if (!params.type || !params.name) throw new Error('type and name are required')
      args.push(params.type, params.name)
      if (params.path) args.push('--path', params.path)
      if (params.uses && params.uses.length > 0) args.push('--uses', params.uses.join(','))
      if (params.from) args.push('--from', params.from)
      if (params.ai && params.type === 'spec' && params.from) args.push('--ai')
      if (params.operation === 'delete') args.push('--delete')
      if (params.operation === 'dry_run') args.push('--dry-run')
      break
    }
    case 'destroy': {
      if (!params.name) throw new Error('name is required for destroy')
      args.push('destroy', params.name)
      break
    }
    case 'smart': {
      args.push('scaffold')
      if (params.names && params.names.length > 0) {
        args.push(...params.names)
      } else if (params.name) {
        args.push(params.name)
      }
      if (params.components && params.components.length > 0) {
        args.push('-w', ...params.components)
      }
      if (params.crud) args.push('--crud')
      if (params.uses && params.uses.length > 0) args.push('--uses', params.uses.join(','))
      break
    }
    case 'from_url': {
      if (!params.url) throw new Error('url is required')
      args.push('from_url', params.url)
      if (params.name) args.push('-n', params.name)
      if (params.ai) args.push('--ai')
      break
    }
  }

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

    // Validate source file exists when using --from
    if (params.from) {
      const fromPath = path.isAbsolute(params.from)
        ? params.from
        : path.join(projectPath, params.from)
      if (!fs.existsSync(fromPath)) {
        return { success: false, output: '', error: `Source file not found: ${params.from}` }
      }
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
