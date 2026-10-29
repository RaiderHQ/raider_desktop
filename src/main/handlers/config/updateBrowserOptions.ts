import { IpcMainInvokeEvent } from 'electron'
import { safeExec } from '../../utils/safeExec'
import { buildShellCommand } from '../../utils/shellCommand'
import { quoteShellArg } from '../../utils/shellQuote'
import { CommandType } from '@foundation/Types/commandType'

const handler = async (
  _event: IpcMainInvokeEvent,
  projectPath: string,
  options: string[]
): Promise<CommandType> => {
  const fixPath = (await import('fix-path')).default
  fixPath()

  try {
    // The gem takes each option as a positional argument; an empty list clears them.
    const args = options.length > 0 ? options.map((o) => quoteShellArg(o)).join(' ') : '--delete'
    const shellCommand = buildShellCommand(projectPath, `raider u browser_options ${args}`)

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
