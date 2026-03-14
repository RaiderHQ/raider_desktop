import { IpcMainInvokeEvent } from 'electron'
import { safeExec } from '../../utils/safeExec'
import { buildShellCommand } from '../../utils/shellCommand'
import { CommandType } from '@foundation/Types/commandType'

const handler = async (
  _event: IpcMainInvokeEvent,
  projectPath: string,
  width: number,
  height: number
): Promise<CommandType> => {
  const fixPath = (await import('fix-path')).default
  fixPath()

  try {
    const shellCommand = buildShellCommand(projectPath, `raider u viewport ${width}x${height}`)

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
