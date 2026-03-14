import runCommand from '../testing/runCommand'
import { CommandType } from '@foundation/Types/commandType'
import { IpcMainInvokeEvent } from 'electron'

const handler = async (_event: IpcMainInvokeEvent): Promise<CommandType> => {
  return runCommand(_event, 'gem install ruby_raider -v 3.2.1')
}

export default handler
