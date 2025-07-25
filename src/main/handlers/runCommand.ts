import { IpcMainInvokeEvent } from 'electron'
import { exec } from 'child_process'
import { CommandType } from '@renderer/src/foundation/Types/commandType'

const handler = (_event: IpcMainInvokeEvent, command: string): Promise<CommandType> => {
  return new Promise((resolve) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        resolve({
          success: false,
          output: stderr.trim(),
          error: error.message
        })
      } else {
        resolve({ success: true, output: stdout.trim() })
      }
    })
  })
}

export default handler
