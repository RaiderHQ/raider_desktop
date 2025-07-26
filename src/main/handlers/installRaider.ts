import runCommand from './runCommand'
import { CommandType } from '@foundation/Types/commandType'

const handler = async (): Promise<CommandType> => {
  return runCommand('gem', ['install', 'ruby_raider', '-v', '1.1.2'], {
    shell: process.platform === 'win32',
    cwd: process.cwd()
  })
}

export default handler
