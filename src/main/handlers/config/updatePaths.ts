import { IpcMainInvokeEvent } from 'electron'
import { safeExec } from '../../utils/safeExec'
import { buildShellCommand } from '../../utils/shellCommand'
import { quoteShellArg } from '../../utils/shellQuote'
import { CommandType } from '@foundation/Types/commandType'

// `raider u path` takes only -s (spec_path) and -h (helper_path); no flag sets page_path
const PATH_FLAGS: Record<string, string> = { spec: '-s', helper: '-h' }

const handler = async (
  _event: IpcMainInvokeEvent,
  projectPath: string,
  pathValue: string,
  pathType?: string
): Promise<CommandType> => {
  // An unknown type must not fall through to the bare command, which would rewrite page_path
  if (pathType !== undefined && !Object.hasOwn(PATH_FLAGS, pathType)) {
    return { success: false, output: '', error: `Unsupported path type: ${pathType}` }
  }

  const fixPath = (await import('fix-path')).default
  fixPath()

  try {
    const args: string[] = ['raider', 'u', 'path', quoteShellArg(pathValue)]

    if (pathType !== undefined) args.push(PATH_FLAGS[pathType])

    const command = args.join(' ')
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
