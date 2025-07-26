import runCommand from './runCommand'
import { CommandType } from '@foundation/Types/commandType'
import { IpcMainInvokeEvent } from 'electron'

const handler = async (_event: IpcMainInvokeEvent): Promise<CommandType> => {
  return runCommand(_event, 'gem install ruby_raider -v 1.1.2')
}

export default handler
