import { IpcMainInvokeEvent } from 'electron'
import { CommandType } from '@foundation/Types/commandType'
import { safeExec } from '../../utils/safeExec'

/**
 * Allowlist of permitted commands. Only exact matches or patterns
 * listed here will be executed. This prevents arbitrary command injection
 * from the renderer process.
 */
const ALLOWED_COMMANDS = ['raider version']

const handler = async (_event: IpcMainInvokeEvent, command: string): Promise<CommandType> => {
  if (!ALLOWED_COMMANDS.includes(command)) {
    return {
      success: false,
      output: '',
      error: `Command not allowed: ${command}`
    }
  }

  const fixPath = (await import('fix-path')).default
  fixPath()

  const result = await safeExec(command, { timeout: 10_000 })

  if (result.exitCode !== 0) {
    return {
      success: false,
      output: result.stderr.trim(),
      error: result.stderr.trim()
    }
  }

  return { success: true, output: result.stdout.trim() }
}

export default handler
