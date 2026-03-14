import { IpcMainInvokeEvent } from 'electron'
import { safeExec } from '../../utils/safeExec'
import { buildShellCommand } from '../../utils/shellCommand'
import { CommandType } from '@foundation/Types/commandType'

type PathType = 'feature' | 'spec' | 'helper'

const handler = async (
  _event: IpcMainInvokeEvent,
  projectPath: string,
  pathValue: string,
  pathType?: PathType
): Promise<CommandType> => {
  const fixPath = (await import('fix-path')).default
  fixPath()

  try {
    const args: string[] = ['raider', 'u', 'path', pathValue]

    if (pathType === 'feature') args.push('-f')
    else if (pathType === 'spec') args.push('-s')
    else if (pathType === 'helper') args.push('-h')

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
